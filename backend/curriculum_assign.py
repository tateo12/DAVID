"""Assign curriculum modules from exported_curriculum import to employees."""

from __future__ import annotations

from database import _utc_now, execute, fetch_one

# How many incomplete assignments an employee may have at once (curriculum + legacy).
MAX_ACTIVE_ASSIGNMENTS = 5
# When risk-based stacking runs, allow a slightly higher ceiling so coaching can catch up.
MAX_ACTIVE_ASSIGNMENTS_NEED = 8


def _next_curriculum_lesson_id(employee_id: int) -> int | None:
    """Next course module in global sequence not yet assigned or completed."""
    row = fetch_one(
        """
        SELECT sl.id FROM skill_lessons sl
        WHERE sl.is_active = 1 AND sl.lesson_source = 'exported_curriculum'
        AND COALESCE(sl.lesson_kind, 'lesson') != 'quiz'
        AND sl.id NOT IN (
            SELECT lesson_id FROM employee_lessons
            WHERE employee_id = ? AND status IN ('assigned', 'completed')
        )
        ORDER BY COALESCE(sl.sequence_order, sl.id) ASC, sl.id ASC
        LIMIT 1
        """,
        (employee_id,),
    )
    return int(row["id"]) if row else None


def assign_next_curriculum_lesson(
    employee_id: int,
    *,
    allow_skill_fallback: bool = True,
    max_active_cap: int | None = None,
) -> bool:
    """Assign the next uncompleted exported-curriculum lesson in course order. Returns True if assigned.

    Uses a single global sequence (sequence_order) so learners progress through the imported
    curriculum in order regardless of skill_class on each row.
    """
    del allow_skill_fallback  # retained for API compatibility; course order is global
    ceiling = max_active_cap if max_active_cap is not None else MAX_ACTIVE_ASSIGNMENTS

    has = fetch_one(
        "SELECT 1 AS x FROM skill_lessons WHERE lesson_source = 'exported_curriculum' LIMIT 1",
    )
    if not has:
        return False

    cap = fetch_one(
        "SELECT COUNT(1) AS c FROM employee_lessons WHERE employee_id = ? AND status = 'assigned'",
        (employee_id,),
    )
    if cap and int(cap["c"] or 0) >= ceiling:
        return False

    lid = _next_curriculum_lesson_id(employee_id)
    if lid is None:
        return False

    execute(
        "INSERT INTO employee_lessons (employee_id, lesson_id, status, assigned_at) VALUES (?, ?, 'assigned', ?)",
        (employee_id, lid, _utc_now()),
    )
    return True


def ensure_initial_lesson_if_none_pending(employee_id: int, skill_class: str) -> None:
    """If employee has no active assignment, assign next curriculum lesson or one legacy lesson."""
    pending = fetch_one(
        "SELECT COUNT(1) AS c FROM employee_lessons WHERE employee_id = ? AND status = 'assigned'",
        (employee_id,),
    )
    if pending and int(pending["c"] or 0) > 0:
        return

    if assign_next_curriculum_lesson(employee_id, allow_skill_fallback=True):
        return

    lesson = fetch_one(
        """
        SELECT id FROM skill_lessons
        WHERE skill_class = ? AND is_active = 1
        ORDER BY COALESCE(sequence_order, id) ASC, id ASC
        LIMIT 1
        """,
        (skill_class,),
    )
    if lesson:
        execute(
            "INSERT INTO employee_lessons (employee_id, lesson_id, status, assigned_at) VALUES (?, ?, 'assigned', ?)",
            (employee_id, int(lesson["id"]), _utc_now()),
        )


def assign_stack_for_need(employee_id: int, *, risk_score: float) -> int:
    """Assign up to 2 extra curriculum lessons when risk is elevated. Returns count assigned."""
    if risk_score < 0.35:
        return 0
    n = 0
    for _ in range(2):
        cap = fetch_one(
            "SELECT COUNT(1) AS c FROM employee_lessons WHERE employee_id = ? AND status = 'assigned'",
            (employee_id,),
        )
        if cap and int(cap["c"] or 0) >= MAX_ACTIVE_ASSIGNMENTS_NEED:
            break
        if assign_next_curriculum_lesson(employee_id, max_active_cap=MAX_ACTIVE_ASSIGNMENTS_NEED):
            n += 1
        else:
            break
    return n


def curriculum_progress_counts(employee_id: int) -> dict[str, int]:
    """Totals for exported curriculum: assigned, completed, remaining, next lesson id if any."""
    total_row = fetch_one(
        """
        SELECT COUNT(1) AS c FROM skill_lessons
        WHERE is_active = 1 AND lesson_source = 'exported_curriculum'
        AND COALESCE(lesson_kind, 'lesson') != 'quiz'
        """
    )
    total = int(total_row["c"] or 0) if total_row else 0
    done_row = fetch_one(
        """
        SELECT COUNT(1) AS c FROM employee_lessons el
        INNER JOIN skill_lessons sl ON sl.id = el.lesson_id
        WHERE el.employee_id = ? AND el.status = 'completed'
        AND sl.lesson_source = 'exported_curriculum'
        AND COALESCE(sl.lesson_kind, 'lesson') != 'quiz'
        """,
        (employee_id,),
    )
    done = int(done_row["c"] or 0) if done_row else 0
    next_id = _next_curriculum_lesson_id(employee_id)
    return {
        "total_curriculum_lessons": total,
        "completed_curriculum": done,
        "next_lesson_id": next_id or 0,
    }
