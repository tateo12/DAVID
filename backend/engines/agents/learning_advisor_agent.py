"""
Agent 2 – Learning Advisor
===========================
Runs in the background after every persisted prompt.

Reads the employee's recent improvement notes, identifies recurring weak patterns,
then updates last_coaching_message so the *next* prompt's coaching tip can reference
the lesson they've been assigned — creating a closed feedback loop.

What it does:
  1. Pull the last 15 skill events for improvements_json patterns
  2. Read currently assigned lesson titles from employee_lessons + skill_lessons
  3. Write a short coaching message back to employee_skill_profiles.last_coaching_message
     that references active lessons and the weakest recurring theme
  4. Update ai_use_profile_summary with a brief pattern description (if changed)
"""

from __future__ import annotations

import json
import logging
from collections import Counter

from database import execute, fetch_one, fetch_rows
from json_utils import loads_json

log = logging.getLogger(__name__)

# Number of recent skill events to scan for improvement patterns
_EVENT_WINDOW = 15


def _top_improvements(employee_id: int) -> list[str]:
    """Return the most frequently recurring improvement suggestions (last N events)."""
    rows = fetch_rows(
        """
        SELECT improvements_json
        FROM employee_skill_events
        WHERE employee_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (employee_id, _EVENT_WINDOW),
    )
    counter: Counter[str] = Counter()
    for row in rows:
        items = loads_json(row["improvements_json"], [])
        if isinstance(items, list):
            for item in items:
                text = str(item).strip()
                if text:
                    # Normalise to first ~60 chars so near-duplicates cluster
                    counter[text[:60].lower()] += 1

    # Return the raw strings for the top 3 themes (most frequent first)
    top: list[str] = []
    for key, _ in counter.most_common(3):
        top.append(key)
    return top


def _active_lesson_titles(employee_id: int) -> list[str]:
    """Return the titles of currently assigned (incomplete) lessons."""
    rows = fetch_rows(
        """
        SELECT sl.title
        FROM employee_lessons el
        INNER JOIN skill_lessons sl ON sl.id = el.lesson_id
        WHERE el.employee_id = ? AND el.status = 'assigned'
        ORDER BY el.id DESC
        LIMIT 3
        """,
        (employee_id,),
    )
    return [str(r["title"]) for r in rows]


def _build_coaching_message(top_improvements: list[str], lesson_titles: list[str]) -> str:
    """Compose a short coaching message that connects recurring weaknesses to active lessons."""
    parts: list[str] = []

    if lesson_titles:
        lessons_str = " | ".join(f'"{t}"' for t in lesson_titles)
        parts.append(f"Active learning: {lessons_str}.")

    if top_improvements:
        theme = top_improvements[0]
        # Capitalise the first letter of the theme fragment
        theme = theme[0].upper() + theme[1:] if theme else theme
        parts.append(f"Focus area this week: {theme}.")

    if not parts:
        return ""

    return " ".join(parts)


def _build_profile_summary(top_improvements: list[str]) -> str:
    if not top_improvements:
        return ""
    themes = "; ".join(top_improvements[:3])
    return f"Recurring improvement areas: {themes}."


class LearningAdvisorAgent:
    """Updates an employee's coaching message with lesson references after each prompt."""

    def run(self, employee_id: int) -> None:
        try:
            improvements = _top_improvements(employee_id)
            lesson_titles = _active_lesson_titles(employee_id)

            coaching_message = _build_coaching_message(improvements, lesson_titles)
            profile_summary = _build_profile_summary(improvements)

            # Only write if we have something meaningful
            if not coaching_message and not profile_summary:
                return

            profile = fetch_one(
                "SELECT last_coaching_message, ai_use_profile_summary FROM employee_skill_profiles WHERE employee_id = ?",
                (employee_id,),
            )

            # Avoid writing unchanged data
            current_msg = str(profile["last_coaching_message"] or "") if profile else ""
            current_summary = str(profile["ai_use_profile_summary"] or "") if profile else ""

            updates: list[str] = []
            params: list = []

            if coaching_message and coaching_message != current_msg:
                updates.append("last_coaching_message = ?")
                params.append(coaching_message)

            if profile_summary and profile_summary != current_summary:
                updates.append("ai_use_profile_summary = ?")
                params.append(profile_summary)

            if not updates:
                return

            params.append(employee_id)
            execute(
                f"UPDATE employee_skill_profiles SET {', '.join(updates)} WHERE employee_id = ?",
                tuple(params),
            )

            log.debug(
                "LearningAdvisorAgent: employee=%d  lessons=%s  theme=%s",
                employee_id,
                lesson_titles[:1],
                improvements[:1],
            )
        except Exception as exc:
            log.warning("LearningAdvisorAgent failed for employee %d: %s", employee_id, exc)
