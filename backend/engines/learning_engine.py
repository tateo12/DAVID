"""Weekly personalized learning content generation.

Analyzes each employee's skill trajectory over the past week, uses an LLM
to generate targeted learning tips, selects relevant lessons, and renders
the learning email.
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from config import get_settings, openrouter_chat_completions_url
from database import fetch_one, fetch_rows
from json_utils import loads_json

log = logging.getLogger(__name__)

DIMENSION_LABELS = {
    "objective_clarity": "Objective Clarity",
    "context_richness": "Context Richness",
    "constraints_defined": "Constraints Defined",
    "specificity": "Specificity",
    "instruction_quality": "Instruction Quality",
}


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


def get_employee_skill_trajectory(employee_id: int) -> dict[str, Any]:
    """Compute an employee's skill trajectory over the past 7 days."""
    profile = fetch_one(
        "SELECT ai_skill_score, skill_class, prompts_evaluated FROM employee_skill_profiles WHERE employee_id = ?",
        (employee_id,),
    )
    if not profile:
        return {"available": False}

    events = fetch_rows(
        """
        SELECT overall_score, dimension_scores_json, strengths_json, improvements_json, created_at
        FROM employee_skill_events
        WHERE employee_id = ? AND created_at >= datetime('now', '-7 day')
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
            dim_sums.setdefault(k, []).append(float(v))

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


def generate_learning_tips_llm(trajectory: dict[str, Any]) -> str:
    """Use LLM to generate 2-3 targeted learning tips based on skill trajectory."""
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
        content = data["choices"][0]["message"]["content"]
        parsed = _parse_json_content(content)
        tips = parsed.get("tips", [])
        if tips:
            return "<br/>".join(f"&bull; {str(t)[:300]}" for t in tips[:3])
    except Exception as exc:
        log.warning("LLM learning tips generation failed: %s", exc)

    return _generate_learning_tips_heuristic(trajectory)


def _generate_learning_tips_heuristic(trajectory: dict[str, Any]) -> str:
    """Fallback heuristic tips when LLM is unavailable."""
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


def get_recommended_lessons(employee_id: int, skill_class: str) -> list[dict[str, str]]:
    """Select lessons matching the employee's current skill class that aren't completed."""
    rows = fetch_rows(
        """
        SELECT sl.id, sl.title, sl.objective
        FROM skill_lessons sl
        WHERE sl.skill_class = ? AND sl.is_active = 1
          AND sl.id NOT IN (
            SELECT lesson_id FROM employee_lessons
            WHERE employee_id = ? AND status = 'completed'
          )
        ORDER BY sl.id
        LIMIT 3
        """,
        (skill_class, employee_id),
    )
    return [{"id": str(r["id"]), "title": r["title"], "objective": r["objective"]} for r in rows]


def build_learning_email_context(employee_id: int) -> dict[str, Any] | None:
    """Build the full template context for one employee's weekly learning email."""
    emp = fetch_one(
        "SELECT id, name, department FROM employees WHERE id = ?",
        (employee_id,),
    )
    if not emp:
        return None

    trajectory = get_employee_skill_trajectory(employee_id)
    if not trajectory.get("available") or trajectory.get("prompts_this_week", 0) == 0:
        return None

    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=7)).date().isoformat()
    week_end = now.date().isoformat()

    skill_class = trajectory["skill_class"]
    current_score = trajectory["current_score"]
    trend = trajectory["trend"]

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
        score = dim_averages.get(key, 0.5)
        dimensions.append({
            "label": label,
            "score_pct": round(score * 100),
        })

    strengths = trajectory.get("latest_strengths", [])
    strengths_text = "<br/>".join(f"&bull; {s}" for s in strengths[:3]) if strengths else ""

    learning_tips = generate_learning_tips_llm(trajectory)

    lessons = get_recommended_lessons(employee_id, skill_class)
    lessons_text = ""
    if lessons:
        parts = []
        for lesson in lessons:
            parts.append(f"<strong>{lesson['title']}</strong>: {lesson['objective']}")
        lessons_text = "<br/>".join(f"&bull; {p}" for p in parts)

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
        "lessons_text": lessons_text,
        "dashboard_url": f"http://localhost:3000/employees/{employee_id}",
    }
