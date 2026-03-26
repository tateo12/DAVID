import json

from fastapi import APIRouter, HTTPException

from database import execute, fetch_one, fetch_rows
from models import (
    CompanySkillSnapshot,
    EmployeeDetail,
    EmployeeLessonStatus,
    EmployeeMemoryEvent,
    EmployeeMemorySnapshot,
    EmployeeSkillProfile,
    EmployeeSummary,
    SkillLesson,
    SkillLessonAssignRequest,
    SkillLessonCompleteRequest,
)

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeSummary])
def list_employees() -> list[EmployeeSummary]:
    rows = fetch_rows(
        """
        SELECT e.id, e.name, e.department, e.risk_score, COUNT(p.id) AS total_prompts,
               COALESCE(esp.ai_skill_score, 0.0) AS ai_skill_score
        FROM employees e
        LEFT JOIN prompts p ON p.employee_id = e.id
        LEFT JOIN employee_skill_profiles esp ON esp.employee_id = e.id
        GROUP BY e.id
        ORDER BY e.risk_score DESC
        """
    )
    return [EmployeeSummary(**dict(row)) for row in rows]


@router.get("/{employee_id}", response_model=EmployeeDetail)
def get_employee(employee_id: int) -> EmployeeDetail:
    row = fetch_one(
        """
        SELECT e.id, e.name, e.department, e.risk_score, COUNT(p.id) AS total_prompts,
               COALESCE(esp.ai_skill_score, 0.0) AS ai_skill_score
        FROM employees e
        LEFT JOIN prompts p ON p.employee_id = e.id
        LEFT JOIN employee_skill_profiles esp ON esp.employee_id = e.id
        WHERE e.id = ?
        GROUP BY e.id
        """,
        (employee_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")

    actions = fetch_rows(
        "SELECT action, COUNT(*) AS count FROM prompts WHERE employee_id = ? GROUP BY action",
        (employee_id,),
    )
    recent_actions = {a["action"]: int(a["count"]) for a in actions}
    return EmployeeDetail(**dict(row), recent_actions=recent_actions)


@router.get("/{employee_id}/skill", response_model=EmployeeSkillProfile)
def get_employee_skill(employee_id: int) -> EmployeeSkillProfile:
    row = fetch_one(
        """
        SELECT employee_id, ai_skill_score, skill_class, prompts_evaluated, last_strengths_json, last_improvements_json, assigned_lessons_json, updated_at
        FROM employee_skill_profiles
        WHERE employee_id = ?
        """,
        (employee_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Employee skill profile not found")
    return EmployeeSkillProfile(
        employee_id=row["employee_id"],
        ai_skill_score=row["ai_skill_score"],
        skill_class=row["skill_class"] if "skill_class" in row.keys() else "developing",
        prompts_evaluated=row["prompts_evaluated"],
        last_strengths=json.loads(row["last_strengths_json"]),
        last_improvements=json.loads(row["last_improvements_json"]),
        assigned_lessons=json.loads(row["assigned_lessons_json"] if "assigned_lessons_json" in row.keys() else "[]"),
        updated_at=row["updated_at"],
    )


@router.get("/skills/company", response_model=CompanySkillSnapshot)
def get_company_skill_snapshot() -> CompanySkillSnapshot:
    row = fetch_one(
        """
        SELECT
            COALESCE(AVG(ai_skill_score), 0.0) AS avg_skill,
            COUNT(*) AS employee_count,
            SUM(CASE WHEN ai_skill_score < 0.45 THEN 1 ELSE 0 END) AS low_skill_count,
            SUM(CASE WHEN ai_skill_score >= 0.75 THEN 1 ELSE 0 END) AS high_skill_count
        FROM employee_skill_profiles
        """
    )
    return CompanySkillSnapshot(
        average_skill_score=round(float(row["avg_skill"] or 0.0), 3),
        employees_tracked=int(row["employee_count"] or 0),
        low_skill_employees=int(row["low_skill_count"] or 0),
        high_skill_employees=int(row["high_skill_count"] or 0),
    )


@router.get("/skills/lessons", response_model=list[SkillLesson])
def list_skill_lessons(skill_class: str | None = None) -> list[SkillLesson]:
    if skill_class:
        rows = fetch_rows(
            "SELECT id, skill_class, title, objective, content, is_active FROM skill_lessons WHERE is_active = 1 AND skill_class = ? ORDER BY id",
            (skill_class,),
        )
    else:
        rows = fetch_rows(
            "SELECT id, skill_class, title, objective, content, is_active FROM skill_lessons WHERE is_active = 1 ORDER BY id"
        )
    lessons: list[SkillLesson] = []
    for row in rows:
        lesson_data = dict(row)
        lesson_data["is_active"] = bool(lesson_data["is_active"])
        lessons.append(SkillLesson(**lesson_data))
    return lessons


@router.post("/{employee_id}/skill/lessons/assign", response_model=EmployeeLessonStatus)
def assign_skill_lesson(employee_id: int, payload: SkillLessonAssignRequest) -> EmployeeLessonStatus:
    employee = fetch_one("SELECT id FROM employees WHERE id = ?", (employee_id,))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    lesson = fetch_one("SELECT id, title FROM skill_lessons WHERE id = ? AND is_active = 1", (payload.lesson_id,))
    if not lesson:
        raise HTTPException(status_code=404, detail="Skill lesson not found")
    existing = fetch_one(
        "SELECT id, assigned_at, completed_at FROM employee_lessons WHERE employee_id = ? AND lesson_id = ? AND status = 'assigned'",
        (employee_id, payload.lesson_id),
    )
    if existing:
        return EmployeeLessonStatus(
            lesson_id=payload.lesson_id,
            title=lesson["title"],
            status="assigned",
            assigned_at=existing["assigned_at"],
            completed_at=existing["completed_at"],
        )
    execute(
        "INSERT INTO employee_lessons (employee_id, lesson_id, status, assigned_at) VALUES (?, ?, 'assigned', datetime('now'))",
        (employee_id, payload.lesson_id),
    )
    pending = fetch_rows(
        "SELECT lesson_id FROM employee_lessons WHERE employee_id = ? AND status = 'assigned' ORDER BY id DESC",
        (employee_id,),
    )
    execute(
        "UPDATE employee_skill_profiles SET assigned_lessons_json = ? WHERE employee_id = ?",
        (json.dumps([str(r["lesson_id"]) for r in pending]), employee_id),
    )
    inserted = fetch_one(
        "SELECT assigned_at, completed_at FROM employee_lessons WHERE employee_id = ? AND lesson_id = ? AND status = 'assigned' ORDER BY id DESC LIMIT 1",
        (employee_id, payload.lesson_id),
    )
    return EmployeeLessonStatus(
        lesson_id=payload.lesson_id,
        title=lesson["title"],
        status="assigned",
        assigned_at=inserted["assigned_at"],
        completed_at=inserted["completed_at"],
    )


@router.post("/{employee_id}/skill/lessons/complete", response_model=EmployeeLessonStatus)
def complete_skill_lesson(employee_id: int, payload: SkillLessonCompleteRequest) -> EmployeeLessonStatus:
    row = fetch_one(
        """
        SELECT el.lesson_id, sl.title, el.assigned_at
        FROM employee_lessons el
        INNER JOIN skill_lessons sl ON sl.id = el.lesson_id
        WHERE el.employee_id = ? AND el.lesson_id = ? AND el.status = 'assigned'
        """,
        (employee_id, payload.lesson_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Assigned lesson not found")
    execute(
        "UPDATE employee_lessons SET status = 'completed', completed_at = datetime('now') WHERE employee_id = ? AND lesson_id = ?",
        (employee_id, payload.lesson_id),
    )
    pending = fetch_rows(
        "SELECT lesson_id FROM employee_lessons WHERE employee_id = ? AND status = 'assigned' ORDER BY id DESC",
        (employee_id,),
    )
    execute(
        "UPDATE employee_skill_profiles SET assigned_lessons_json = ? WHERE employee_id = ?",
        (json.dumps([str(r["lesson_id"]) for r in pending]), employee_id),
    )
    completed = fetch_one(
        "SELECT completed_at FROM employee_lessons WHERE employee_id = ? AND lesson_id = ? ORDER BY id DESC LIMIT 1",
        (employee_id, payload.lesson_id),
    )
    return EmployeeLessonStatus(
        lesson_id=row["lesson_id"],
        title=row["title"],
        status="completed",
        assigned_at=row["assigned_at"],
        completed_at=completed["completed_at"] if completed else None,
    )


@router.get("/{employee_id}/skill/lessons", response_model=list[EmployeeLessonStatus])
def list_employee_lessons(employee_id: int) -> list[EmployeeLessonStatus]:
    rows = fetch_rows(
        """
        SELECT el.lesson_id, sl.title, el.status, el.assigned_at, el.completed_at
        FROM employee_lessons el
        INNER JOIN skill_lessons sl ON sl.id = el.lesson_id
        WHERE el.employee_id = ?
        ORDER BY el.id DESC
        """,
        (employee_id,),
    )
    return [EmployeeLessonStatus(**dict(row)) for row in rows]


@router.get("/{employee_id}/memory", response_model=EmployeeMemorySnapshot)
def get_employee_memory_snapshot(employee_id: int) -> EmployeeMemorySnapshot:
    employee = fetch_one("SELECT id FROM employees WHERE id = ?", (employee_id,))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    stats = fetch_one(
        """
        SELECT
            COUNT(*) AS interactions_30d,
            COALESCE(AVG(CASE risk_level
                WHEN 'critical' THEN 1.0
                WHEN 'high' THEN 0.75
                WHEN 'medium' THEN 0.5
                ELSE 0.2 END), 0.0) AS avg_risk_score_30d,
            COALESCE(AVG(skill_score), 0.0) AS avg_skill_score_30d
        FROM employee_interaction_memory
        WHERE employee_id = ? AND created_at >= datetime('now', '-30 day')
        """,
        (employee_id,),
    )
    latest = fetch_one(
        """
        SELECT skill_class
        FROM employee_interaction_memory
        WHERE employee_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (employee_id,),
    )
    return EmployeeMemorySnapshot(
        employee_id=employee_id,
        interactions_30d=int(stats["interactions_30d"] or 0),
        avg_risk_score_30d=round(float(stats["avg_risk_score_30d"] or 0.0), 3),
        avg_skill_score_30d=round(float(stats["avg_skill_score_30d"] or 0.0), 3),
        latest_skill_class=(latest["skill_class"] if latest else "developing"),
    )


@router.get("/{employee_id}/memory/events", response_model=list[EmployeeMemoryEvent])
def list_employee_memory_events(employee_id: int, limit: int = 50) -> list[EmployeeMemoryEvent]:
    rows = fetch_rows(
        """
        SELECT id, employee_id, prompt_id, risk_level, action, skill_score, skill_class, created_at
        FROM employee_interaction_memory
        WHERE employee_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (employee_id, max(1, min(limit, 200))),
    )
    return [EmployeeMemoryEvent(**dict(row)) for row in rows]
