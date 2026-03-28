import json
import os
from typing import Any

import requests

from config import get_settings, openrouter_chat_completions_url
from models import Detection, PromptSkillEvaluation


class SkillAnalysisAgent:
    """LLM-powered prompt skill evaluator that replaces the keyword-heuristic
    approach in coaching_engine.evaluate_prompt_skill.

    Uses OpenRouter (same infra as L2/L3) to score prompt engineering quality
    across five dimensions, generate actionable coaching, and factor in the
    employee's skill trajectory.

    Falls back gracefully so the orchestrator can use the heuristic fallback
    if the LLM call fails or is over budget.
    """

    name = "SkillAnalysisAgent"

    def _get_api_key(self) -> str:
        settings = get_settings()
        return settings.openrouter_api_key or os.getenv("API_SECRET_KEY", "")

    def _is_available(self) -> bool:
        return bool(self._get_api_key())

    @staticmethod
    def _skill_class_from_score(score: float) -> str:
        if score < 0.45:
            return "novice"
        if score < 0.65:
            return "developing"
        if score < 0.82:
            return "proficient"
        return "advanced"

    @staticmethod
    def _build_user_payload(
        prompt_text: str,
        detections: list[Detection],
        skill_profile: dict[str, Any] | None,
    ) -> str:
        detection_summary = [
            {
                "type": d.type.value,
                "subtype": d.subtype,
                "severity": d.severity.value,
            }
            for d in detections[:10]
        ]

        trajectory = "unknown"
        previous_score = None
        previous_class = None
        if skill_profile:
            previous_score = skill_profile.get("ai_skill_score")
            previous_class = skill_profile.get("skill_class")
            prompts_evaluated = skill_profile.get("prompts_evaluated", 0)
            if prompts_evaluated and prompts_evaluated > 2:
                trajectory = "established"
            else:
                trajectory = "early"

        return json.dumps(
            {
                "prompt_text": prompt_text[:4000],
                "security_detections": detection_summary,
                "detection_count": len(detections),
                "employee_trajectory": trajectory,
                "previous_skill_score": previous_score,
                "previous_skill_class": previous_class,
            }
        )

    @staticmethod
    def _parse_json_content(content: str) -> dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start >= 0 and end > start:
                return json.loads(content[start : end + 1])
            raise

    def run(
        self,
        prompt_text: str,
        detections: list[Detection],
        skill_profile: dict[str, Any] | None = None,
    ) -> PromptSkillEvaluation:
        if not self._is_available():
            raise RuntimeError("SkillAnalysisAgent unavailable: no API key configured")

        settings = get_settings()
        api_key = self._get_api_key()

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.openrouter_site_url,
            "X-Title": settings.openrouter_app_name,
        }

        payload = {
            "model": settings.l2_model_name,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an expert prompt engineering and AI-workflow coach for an enterprise AI governance platform. "
                        "Analyze this single prompt as a sample of how the employee uses AI at work.\n\n"
                        "Score five dimensions (each 0.0 to 1.0):\n"
                        "1. objective_clarity - Clear task/outcome?\n"
                        "2. context_richness - Background, audience, business context?\n"
                        "3. constraints_defined - Format, tone, length, quality constraints?\n"
                        "4. specificity - Enough detail to avoid guesswork?\n"
                        "5. instruction_quality - Examples, criteria, step-by-step structure?\n\n"
                        "Security: PII/secrets/policy findings mean weak data-handling judgment — lower overall_score.\n"
                        "Compare to previous_skill_score / previous_skill_class when provided.\n\n"
                        "Respond with strict JSON only:\n"
                        "- dimension_scores: {objective_clarity, context_richness, constraints_defined, specificity, instruction_quality}\n"
                        "- overall_score: 0.0-1.0 (penalize for security issues)\n"
                        "- strengths: 1-3 specific positives about this prompt\n"
                        "- improvements: 1-4 actionable suggestions with short rewrite hints\n"
                        "- coaching_message: one concise sentence for the employee\n"
                        "- ai_use_profile_summary: 2-4 sentences describing patterns in how this person uses AI "
                        "(e.g. task-first vs vague asks, use of constraints, tendency to paste sensitive context). "
                        "Write for a manager skimming Skill Hub; update-style from this prompt + trajectory only.\n\n"
                        "Improvements must be specific. Bad: 'Add constraints'. "
                        "Good: 'Ask for a 150-word summary for executives, not an open-ended essay.'"
                    ),
                },
                {
                    "role": "user",
                    "content": self._build_user_payload(
                        prompt_text, detections, skill_profile
                    ),
                },
            ],
        }

        response = requests.post(
            openrouter_chat_completions_url(),
            headers=headers,
            json=payload,
            timeout=25,
        )
        response.raise_for_status()
        data = response.json()
        message = data["choices"][0]["message"]["content"]
        parsed = self._parse_json_content(message)

        dim_raw = parsed.get("dimension_scores", {})
        dimension_scores = {
            "objective_clarity": _clamp(dim_raw.get("objective_clarity", 0.5)),
            "context_richness": _clamp(dim_raw.get("context_richness", 0.5)),
            "constraints_defined": _clamp(dim_raw.get("constraints_defined", 0.5)),
            "specificity": _clamp(dim_raw.get("specificity", 0.5)),
            "instruction_quality": _clamp(dim_raw.get("instruction_quality", 0.5)),
        }

        overall = _clamp(parsed.get("overall_score", 0.5))
        strengths = [str(s)[:200] for s in parsed.get("strengths", [])[:3]]
        improvements = [str(s)[:300] for s in parsed.get("improvements", [])[:4]]
        coaching_message = str(parsed.get("coaching_message", ""))[:500]

        if not strengths:
            strengths = ["Prompt was submitted for analysis."]
        if not improvements:
            improvements = ["Add a clear objective, context, and output constraints."]
        if not coaching_message:
            coaching_message = "Focus on clarity, context, and constraints to improve your prompt quality."

        profile_summary = str(parsed.get("ai_use_profile_summary", ""))[:1200].strip()
        if not profile_summary:
            profile_summary = (
                "Latest prompt reviewed for clarity, constraints, and safe use of AI; keep building explicit "
                "objectives and audience in each request."
            )

        return PromptSkillEvaluation(
            overall_score=round(overall, 3),
            skill_class=self._skill_class_from_score(overall),
            dimension_scores={k: round(v, 3) for k, v in dimension_scores.items()},
            strengths=strengths,
            improvements=improvements,
            coaching_message=coaching_message,
            ai_use_profile_summary=profile_summary,
        )


def _clamp(value: Any, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(lo, min(hi, v))
