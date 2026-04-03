"""Weekly personalized learning content generation.

Builds a custom study page from recent prompts + skill trajectory, emails it, and
persists a focus row so later prompt evaluations can detect improvement.
"""

from __future__ import annotations

import html
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from config import frontend_base_url, get_settings, openrouter_chat_completions_url
from database import _utc_now, execute, fetch_one, fetch_rows, get_conn, sql_ago
from json_utils import loads_json

log = logging.getLogger(__name__)

DIMENSION_LABELS = {
    "objective_clarity": "Objective Clarity",
    "context_richness": "Context Richness",
    "constraints_defined": "Constraints Defined",
    "specificity": "Specificity",
    "instruction_quality": "Instruction Quality",
}

VALID_DIMENSION_KEYS = frozenset(DIMENSION_LABELS.keys())


def _get_api_key() -> str:
    settings = get_settings()
    return settings.openrouter_api_key or os.getenv("API_SECRET_KEY", "")


def _parse_json_content(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            return json.loads(content[start : end + 1])
        raise


def _openrouter_choice_content(data: dict[str, Any]) -> str | None:
    """Extract assistant text from OpenRouter-style chat completion JSON."""
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    c0 = choices[0]
    if not isinstance(c0, dict):
        return None
    msg = c0.get("message")
    if isinstance(msg, dict) and msg.get("content") is not None:
        return str(msg.get("content") or "")
    return None


def get_employee_skill_trajectory(employee_id: int) -> dict[str, Any]:
    """Compute an employee's skill trajectory over the past 7 days."""
    profile = fetch_one(
        "SELECT ai_skill_score, skill_class, prompts_evaluated FROM employee_skill_profiles WHERE employee_id = ?",
        (employee_id,),
    )
    if not profile:
        return {"available": False}

    events = fetch_rows(
        f"""
        SELECT overall_score, dimension_scores_json, strengths_json, improvements_json, created_at
        FROM employee_skill_events
        WHERE employee_id = ? AND created_at >= {sql_ago(7)}
        ORDER BY created_at ASC
        """,
        (employee_id,),
    )

    if not events:
        return {
            "available": True,
            "current_score": float(profile["ai_skill_score"]),
            "skill_class": profile["skill_class"],
            "prompts_this_week": 0,
            "trend": "stagnant",
            "dimension_averages": {},
            "weakest_dimensions": [],
            "latest_improvements": [],
            "latest_strengths": [],
        }

    scores = [float(e["overall_score"]) for e in events]
    current_score = float(profile["ai_skill_score"])
    prompts_this_week = len(events)

    if len(scores) >= 2:
        first_half = scores[: len(scores) // 2]
        second_half = scores[len(scores) // 2 :]
        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)
        if avg_second > avg_first + 0.03:
            trend = "improving"
        elif avg_second < avg_first - 0.03:
            trend = "declining"
        else:
            trend = "stable"
    else:
        trend = "early"

    dim_sums: dict[str, list[float]] = {}
    for e in events:
        dims = loads_json(e["dimension_scores_json"], None)
        if not isinstance(dims, dict):
            continue
        for k, v in dims.items():
            try:
                dim_sums.setdefault(k, []).append(float(v))
            except (TypeError, ValueError):
                continue

    dim_averages = {k: round(sum(v) / len(v), 3) for k, v in dim_sums.items() if v}
    sorted_dims = sorted(dim_averages.items(), key=lambda x: x[1])
    weakest = [k for k, _ in sorted_dims[:2]] if sorted_dims else []

    latest_event = events[-1]
    latest_improvements = loads_json(latest_event["improvements_json"], [])
    latest_strengths = loads_json(latest_event["strengths_json"], [])

    return {
        "available": True,
        "current_score": current_score,
        "skill_class": profile["skill_class"],
        "prompts_this_week": prompts_this_week,
        "trend": trend,
        "dimension_averages": dim_averages,
        "weakest_dimensions": weakest,
        "latest_improvements": latest_improvements,
        "latest_strengths": latest_strengths,
    }


def fetch_recent_prompt_samples(employee_id: int, limit: int = 12) -> list[str]:
    rows = fetch_rows(
        f"""
        SELECT prompt_text, redacted_prompt FROM prompts
        WHERE employee_id = ? AND created_at >= {sql_ago(7)}
        ORDER BY id DESC LIMIT ?
        """,
        (employee_id, limit),
    )
    out: list[str] = []
    for r in rows:
        t = (r["redacted_prompt"] or r["prompt_text"] or "").strip()
        if len(t) > 500:
            t = t[:500] + "…"
        if t:
            out.append(t)
    return out


def _plain_text_to_email_html(text: str) -> str:
    t = html.escape(text or "")
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    parts = []
    for para in t.split("\n\n"):
        inner = para.replace("\n", "<br/>")
        if inner.strip():
            parts.append(
                '<p style="margin:0 0 12px 0; color:#334155; font-size:14px; line-height:22px;">'
                f"{inner}</p>"
            )
    return "".join(parts) or '<p style="color:#334155;">(No content)</p>'


def _normalize_focus_dimensions(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for x in raw:
        k = str(x).strip()
        if k in VALID_DIMENSION_KEYS and k not in out:
            out.append(k)
    return out[:3]


def _heuristic_study_page(trajectory: dict[str, Any], prompt_samples: list[str]) -> dict[str, Any]:
    weakest = trajectory.get("weakest_dimensions") or []
    if not weakest:
        weakest = list(DIMENSION_LABELS.keys())[:2]
    focus_dims = _normalize_focus_dimensions(weakest)

    tip_map = {
        "objective_clarity": (
            "Lead with the outcome you want (verb + deliverable). Name the audience and success criteria.\n\n"
            "Example: Instead of “thoughts on the deck?”, use "
            "“Summarize slide 4–8 for our CFO: risks, decisions needed, and 3 recommendations.”"
        ),
        "context_richness": (
            "Add who it is for, what they already know, and what decision this supports.\n\n"
            "Paste only non-sensitive placeholders for names or IDs when needed."
        ),
        "constraints_defined": (
            "State format (bullets/table), length, tone, and must-include / must-avoid constraints.\n\n"
            "This reduces rework and makes outputs reviewable."
        ),
        "specificity": (
            "Replace vague nouns with measurable details: timeframe, scope, definitions, examples.\n\n"
            "If the model could answer ten different ways, your prompt is still too open."
        ),
        "instruction_quality": (
            "Use checklists, steps, or a mini-rubric (“grade each item High/Med/Low”).\n\n"
            "Ask for structured output you can scan in under a minute."
        ),
    }

    sections: list[dict[str, str]] = []
    intro_lines = "\n\n---\n\n".join(f"Prompt sample {i + 1}:\n{s}" for i, s in enumerate(prompt_samples[:8]))
    sections.append(
        {
            "heading": "What we noticed in your recent prompts",
            "body": intro_lines or "No recent prompt text was available.",
        }
    )
    for dim in focus_dims[:2]:
        label = DIMENSION_LABELS.get(dim, dim)
        sections.append({"heading": f"Study focus: {label}", "body": tip_map.get(dim, tip_map["objective_clarity"])})

    title = f"Improve {DIMENSION_LABELS.get(focus_dims[0], 'your prompting')}" if focus_dims else "Weekly prompt skills study page"
    return {"focus_title": title, "focus_dimensions": focus_dims, "sections": sections}


def generate_custom_study_page(trajectory: dict[str, Any], prompt_samples: list[str]) -> dict[str, Any]:
    """Return focus_title, focus_dimensions, sections (heading + plain-text body)."""
    api_key = _get_api_key()
    if not api_key or not prompt_samples:
        return _heuristic_study_page(trajectory, prompt_samples)

    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_app_name,
    }

    payload = {
        "model": settings.skill_model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a prompt-engineering coach. Given an employee's recent prompts (may contain "
                    "placeholders) and skill trajectory JSON, produce ONE study page as structured sections.\n"
                    "Rules:\n"
                    "- No HTML. Plain text only in section bodies.\n"
                    "- 4–6 sections with short headings.\n"
                    "- Reference patterns from their samples without quoting secrets verbatim; paraphrase.\n"
                    "- Include concrete before/after prompt examples (fictional or anonymized).\n"
                    "- focus_dimensions must be 1–3 items from this set only: "
                    f"{sorted(VALID_DIMENSION_KEYS)}.\n"
                    "Respond with strict JSON: {\n"
                    '  "focus_title": "short title",\n'
                    '  "focus_dimensions": ["objective_clarity", ...],\n'
                    '  "sections": [{"heading": "...", "body": "..."}]\n'
                    "}"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "trajectory": {
                            "skill_class": trajectory.get("skill_class", "developing"),
                            "current_score": trajectory.get("current_score", 0.5),
                            "trend": trajectory.get("trend", "stable"),
                            "weakest_dimensions": trajectory.get("weakest_dimensions", []),
                            "dimension_averages": trajectory.get("dimension_averages", {}),
                            "latest_improvements": (trajectory.get("latest_improvements") or [])[:3],
                        },
                        "recent_prompt_samples": prompt_samples[:10],
                    }
                ),
            },
        ],
    }

    try:
        resp = requests.post(
            openrouter_chat_completions_url(),
            headers=headers,
            json=payload,
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = _parse_json_content(content)
        sections_raw = parsed.get("sections", [])
        sections: list[dict[str, str]] = []
        if isinstance(sections_raw, list):
            for s in sections_raw[:8]:
                if not isinstance(s, dict):
                    continue
                h = str(s.get("heading", "")).strip() or "Section"
                b = str(s.get("body", "")).strip()
                if b:
                    sections.append({"heading": h[:200], "body": b[:6000]})
        if len(sections) < 2:
            return _heuristic_study_page(trajectory, prompt_samples)
        focus_title = str(parsed.get("focus_title", "") or "Your weekly study page").strip()[:200]
        focus_dims = _normalize_focus_dimensions(parsed.get("focus_dimensions"))
        if not focus_dims:
            focus_dims = _normalize_focus_dimensions(trajectory.get("weakest_dimensions"))
        return {"focus_title": focus_title, "focus_dimensions": focus_dims, "sections": sections}
    except Exception as exc:
        log.warning("LLM custom study page failed: %s", exc)
        return _heuristic_study_page(trajectory, prompt_samples)


def _baseline_dimensions(employee_id: int, trajectory: dict[str, Any]) -> dict[str, float]:
    base = {k: 0.5 for k in DIMENSION_LABELS}
    prof = fetch_one(
        "SELECT last_dimension_scores_json FROM employee_skill_profiles WHERE employee_id = ?",
        (employee_id,),
    )
    raw = loads_json(prof["last_dimension_scores_json"], {}) if prof else {}
    if isinstance(raw, dict):
        for k in DIMENSION_LABELS:
            if k in raw:
                try:
                    base[k] = float(raw[k])
                except (TypeError, ValueError):
                    pass
    tra = trajectory.get("dimension_averages") or {}
    if isinstance(tra, dict):
        for k in DIMENSION_LABELS:
            if k in tra:
                try:
                    base[k] = float(tra[k])
                except (TypeError, ValueError):
                    pass
    return base


def persist_weekly_study_focus(
    employee_id: int,
    week_start: str,
    focus_title: str,
    focus_dimensions: list[str],
    sections: list[dict[str, str]],
    baseline_dims: dict[str, float],
    *,
    persist: bool,
) -> None:
    if not persist:
        return
    sent = _utc_now()
    with get_conn() as conn:
        conn.execute(
            "UPDATE employee_weekly_study_focus SET active = 0, improvement_status = 'superseded' WHERE employee_id = ? AND active = 1",
            (employee_id,),
        )
        conn.execute(
            """
            INSERT INTO employee_weekly_study_focus (
                employee_id, week_start, focus_title, focus_dimensions_json, study_sections_json,
                baseline_dimension_scores_json, improvement_status, sent_at, last_evaluated_at, active
            ) VALUES (?, ?, ?, ?, ?, ?, 'monitoring', ?, NULL, 1)
            """,
            (
                employee_id,
                week_start,
                focus_title,
                json.dumps(focus_dimensions),
                json.dumps(sections),
                json.dumps(baseline_dims),
                sent,
            ),
        )


def evaluate_active_study_focus(employee_id: int) -> None:
    row = fetch_one(
        """
        SELECT id, focus_dimensions_json, baseline_dimension_scores_json, improvement_status, sent_at
        FROM employee_weekly_study_focus
        WHERE employee_id = ? AND active = 1
        """,
        (employee_id,),
    )
    if not row or (row["improvement_status"] or "") != "monitoring":
        return

    profile = fetch_one(
        "SELECT last_dimension_scores_json FROM employee_skill_profiles WHERE employee_id = ?",
        (employee_id,),
    )
    if not profile:
        return
    current = loads_json(profile["last_dimension_scores_json"], {})
    if not isinstance(current, dict):
        return
    baseline = loads_json(row["baseline_dimension_scores_json"], {})
    if not isinstance(baseline, dict):
        baseline = {}
    focus_dims = loads_json(row["focus_dimensions_json"], [])
    if not isinstance(focus_dims, list) or not focus_dims:
        execute(
            "UPDATE employee_weekly_study_focus SET last_evaluated_at = ? WHERE id = ?",
            (_utc_now(), row["id"]),
        )
        return

    diffs: list[float] = []
    for d in focus_dims:
        if str(d) not in VALID_DIMENSION_KEYS:
            continue
        k = str(d)
        try:
            cb = float(baseline.get(k, 0.5))
            cc = float(current.get(k, cb))
            diffs.append(cc - cb)
        except (TypeError, ValueError):
            continue

    if not diffs:
        execute(
            "UPDATE employee_weekly_study_focus SET last_evaluated_at = ? WHERE id = ?",
            (_utc_now(), row["id"]),
        )
        return

    avg_diff = sum(diffs) / len(diffs)
    ev_row = fetch_one(
        """
        SELECT COUNT(1) AS c FROM employee_skill_events
        WHERE employee_id = ? AND created_at > ?
        """,
        (employee_id, row["sent_at"]),
    )
    n_new = int(ev_row["c"] or 0) if ev_row else 0

    now = _utc_now()
    if avg_diff >= 0.035:
        execute(
            "UPDATE employee_weekly_study_focus SET improvement_status = 'improved', last_evaluated_at = ? WHERE id = ?",
            (now, row["id"]),
        )
    elif n_new >= 3 and avg_diff <= -0.02:
        execute(
            "UPDATE employee_weekly_study_focus SET improvement_status = 'not_improved', last_evaluated_at = ? WHERE id = ?",
            (now, row["id"]),
        )
    else:
        execute(
            "UPDATE employee_weekly_study_focus SET last_evaluated_at = ? WHERE id = ?",
            (now, row["id"]),
        )


def generate_learning_tips_llm(trajectory: dict[str, Any]) -> str:
    """Short HTML summary (fallback block in template)."""
    api_key = _get_api_key()
    if not api_key:
        return _generate_learning_tips_heuristic(trajectory)

    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_app_name,
    }

    payload = {
        "model": settings.skill_model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a prompt engineering coach for enterprise employees. "
                    "Based on the employee's skill trajectory data, generate 2-3 specific, "
                    "actionable learning tips tailored to their weakest dimensions. "
                    "Each tip should include a concrete before/after example. "
                    "Respond with strict JSON: {\"tips\": [\"tip1\", \"tip2\", \"tip3\"]}"
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "skill_class": trajectory.get("skill_class", "developing"),
                    "current_score": trajectory.get("current_score", 0.5),
                    "trend": trajectory.get("trend", "stable"),
                    "weakest_dimensions": trajectory.get("weakest_dimensions", []),
                    "dimension_averages": trajectory.get("dimension_averages", {}),
                    "latest_improvements": trajectory.get("latest_improvements", [])[:3],
                }),
            },
        ],
    }

    try:
        resp = requests.post(
            openrouter_chat_completions_url(),
            headers=headers,
            json=payload,
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json()
        content = _openrouter_choice_content(data)
        if not content:
            return _generate_learning_tips_heuristic(trajectory)
        parsed = _parse_json_content(content)
        tips = parsed.get("tips", [])
        if tips:
            return "<br/>".join(f"&bull; {str(t)[:300]}" for t in tips[:3])
    except Exception as exc:
        log.warning("LLM learning tips generation failed: %s", exc)

    return _generate_learning_tips_heuristic(trajectory)


def _generate_learning_tips_heuristic(trajectory: dict[str, Any]) -> str:
    tips = []
    weakest = trajectory.get("weakest_dimensions", [])

    tip_map = {
        "objective_clarity": (
            "Start every prompt with a clear action verb (summarize, draft, analyze, compare). "
            "Instead of 'Tell me about the report', try 'Summarize the Q3 revenue report in 3 bullet points for the executive team.'"
        ),
        "context_richness": (
            "Add audience, purpose, and background to your prompts. "
            "Instead of 'Write an email', try 'Draft a follow-up email to the client (enterprise SaaS buyer) "
            "who attended our demo yesterday. Tone: professional but warm.'"
        ),
        "constraints_defined": (
            "Specify format, length, tone, and quality constraints. "
            "Instead of 'Explain this concept', try 'Explain API rate limiting in under 100 words, "
            "using an analogy suitable for a non-technical product manager.'"
        ),
        "specificity": (
            "Replace vague requests with concrete details. "
            "Instead of 'Help with my presentation', try 'Create 5 slide titles for a 10-minute "
            "presentation on our Q3 customer retention improvements, audience: board of directors.'"
        ),
        "instruction_quality": (
            "Use step-by-step instructions, examples, or evaluation criteria. "
            "Instead of 'Review this code', try 'Review this Python function for: "
            "1) correctness, 2) edge cases, 3) readability. Flag any issues with severity (high/medium/low).'"
        ),
    }

    for dim in weakest[:2]:
        if dim in tip_map:
            tips.append(tip_map[dim])

    if not tips:
        tips.append(
            "Focus on the Task-Context-Constraints pattern: state what you want, "
            "provide background, and define output requirements."
        )

    return "<br/>".join(f"&bull; {t}" for t in tips)


def _trajectory_with_prompts(employee_id: int, samples: list[str], trajectory: dict[str, Any]) -> dict[str, Any]:
    if trajectory.get("available"):
        t = dict(trajectory)
        t["prompts_this_week"] = max(int(t.get("prompts_this_week") or 0), len(samples))
        return t
    return {
        "available": True,
        "current_score": 0.5,
        "skill_class": "developing",
        "prompts_this_week": len(samples),
        "trend": "early",
        "dimension_averages": {},
        "weakest_dimensions": [],
        "latest_improvements": [],
        "latest_strengths": [],
    }


def build_learning_email_context(employee_id: int, *, persist_study_focus: bool = True) -> dict[str, Any] | None:
    """Build the full template context for one employee's weekly learning email."""
    emp = fetch_one(
        "SELECT id, name, department FROM employees WHERE id = ?",
        (employee_id,),
    )
    if not emp:
        return None

    samples = fetch_recent_prompt_samples(employee_id)
    if not samples:
        return None

    trajectory = _trajectory_with_prompts(employee_id, samples, get_employee_skill_trajectory(employee_id))

    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=7)).date().isoformat()
    week_end = now.date().isoformat()

    skill_class = str(trajectory["skill_class"])
    current_score = float(trajectory["current_score"])
    trend = str(trajectory["trend"])

    trend_display_map = {
        "improving": "+Improving",
        "declining": "-Declining",
        "stable": "Stable",
        "early": "Just Getting Started",
        "stagnant": "Stable",
    }

    dim_averages = trajectory.get("dimension_averages", {})
    dimensions = []
    for key, label in DIMENSION_LABELS.items():
        score = float(dim_averages.get(key, 0.5)) if isinstance(dim_averages, dict) else 0.5
        dimensions.append({
            "label": label,
            "score_pct": round(score * 100),
        })

    strengths = trajectory.get("latest_strengths", [])
    strengths_text = "<br/>".join(f"&bull; {s}" for s in strengths[:3]) if strengths else ""

    study = generate_custom_study_page(trajectory, samples)
    focus_title = study["focus_title"]
    focus_dimensions = study["focus_dimensions"]
    sections = study["sections"]
    study_sections = [
        {"heading": html.escape(s["heading"]), "body_html": _plain_text_to_email_html(s["body"])}
        for s in sections
    ]

    baseline = _baseline_dimensions(employee_id, trajectory)
    persist_weekly_study_focus(
        employee_id,
        week_start,
        focus_title,
        focus_dimensions,
        sections,
        baseline,
        persist=persist_study_focus,
    )

    dim_labels = [DIMENSION_LABELS.get(d, d) for d in focus_dimensions]
    if dim_labels:
        focus_tracking_message = (
            "We will keep monitoring your evaluated prompts for movement on: "
            + ", ".join(dim_labels)
            + ". Keep applying this page for the next week."
        )
    else:
        focus_tracking_message = (
            "We will keep monitoring your evaluated prompts against your skill dimensions after you send new prompts."
        )

    learning_tips = generate_learning_tips_llm(trajectory)

    dash = frontend_base_url().rstrip("/")
    return {
        "employee_name": emp["name"],
        "week_start": week_start,
        "week_end": week_end,
        "skill_class": skill_class,
        "skill_score_display": f"{round(current_score * 100)}%",
        "trend": trend,
        "trend_display": trend_display_map.get(trend, trend.title()),
        "prompts_this_week": trajectory["prompts_this_week"],
        "dimensions": dimensions,
        "strengths_text": strengths_text,
        "learning_tips": learning_tips,
        "lessons_text": "",
        "study_focus_title": focus_title,
        "study_sections": study_sections,
        "focus_tracking_message": focus_tracking_message,
        "dashboard_url": f"{dash}/employees/{employee_id}",
    }
