import json
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, get_current_user_optional, get_org_id, require_ops_manager
from config import frontend_base_url
from curriculum_assign import (
    assign_next_curriculum_lesson,
    assign_stack_for_need,
    curriculum_progress_counts,
    ensure_initial_lesson_if_none_pending,
)
from database import (
    _utc_now,
    delete_employee_cascade,
    ensure_employee_skill_profile,
    execute,
    fetch_one,
    fetch_rows,
)
from engines.email_sender import process_pending_employee_invite_reminders, send_employee_invite_email
from json_utils import loads_json
from models import (
    CompanySkillSnapshot,
    CurriculumProgressResponse,
    CurriculumUnitOutline,
    EmployeeDetail,
    EmployeeInviteCreate,
    EmployeeInviteCreated,
    EmployeeLessonStatus,
    EmployeeMemoryEvent,
    EmployeeMemorySnapshot,
    EmployeePatch,
    EmployeeSkillProfile,
    EmployeeSummary,
    EmployeeTeamMember,
    SkillLesson,
    SkillLessonAssignRequest,
    SkillLessonCompleteRequest,
)

router = APIRouter(prefix="/employees", tags=["employees"])


def _require_manager(current_user: dict) -> None:
    if current_user.get("role") not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Managers only")


def _ensure_employee_access(current_user: dict | None, employee_id: int) -> None:
    if not current_user or current_user.get("role") not in ("employee",):
        return
    eid = current_user.get("employee_id")
    if eid is None:
        raise HTTPException(status_code=403, detail="Your account is not linked to an employee profile")
    if int(eid) != int(employee_id):
        raise HTTPException(status_code=403, detail="Not allowed to view other employees")


def _ensure_employee_self_or_manager(current_user: dict | None, employee_id: int) -> None:
    if not current_user:
        return
    if current_user.get("role") in ("manager", "admin"):
        return
    if current_user.get("role") == "employee":
        _ensure_employee_access(current_user, employee_id)


def _next_employee_id() -> int:
    row = fetch_one("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM employees")
    return int(row["n"] if row else 1)


@router.get("", response_model=list[EmployeeSummary])
def list_employees(current_user: dict = Depends(get_current_user)) -> list[EmployeeSummary]:
    org_id = get_org_id(current_user)
    if current_user.get("role") == "employee":
        eid = current_user.get("employee_id")
        if eid is None:
            return []
        rows = fetch_rows(
            """
            SELECT e.id, e.name, e.department, e.risk_score, COUNT(p.id) AS total_prompts,
                   COALESCE(esp.ai_skill_score, 0.0) AS ai_skill_score,
                   COALESCE(e.email, '') AS email
            FROM employees e
            LEFT JOIN prompts p ON p.employee_id = e.id
            LEFT JOIN employee_skill_profiles esp ON esp.employee_id = e.id
            WHERE e.id = ? AND e.org_id = ?
            GROUP BY e.id
            ORDER BY e.risk_score DESC
            """,
            (eid, org_id),
        )
    else:
        rows = fetch_rows(
            """
            SELECT e.id, e.name, e.department, e.risk_score, COUNT(p.id) AS total_prompts,
                   COALESCE(esp.ai_skill_score, 0.0) AS ai_skill_score,
                   COALESCE(e.email, '') AS email
            FROM employees e
            LEFT JOIN prompts p ON p.employee_id = e.id
            LEFT JOIN employee_skill_profiles esp ON esp.employee_id = e.id
            WHERE e.org_id = ?
            GROUP BY e.id
            ORDER BY e.risk_score DESC
            """,
            (org_id,),
        )
    return [EmployeeSummary(**dict(row)) for row in rows]


@router.get("/team", response_model=list[EmployeeTeamMember])
def list_team_directory(current_user: dict | None = Depends(get_current_user_optional)) -> list[EmployeeTeamMember]:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    _require_manager(current_user)
    org_id = get_org_id(current_user)
    process_pending_employee_invite_reminders()
    rows = fetch_rows(
        """
        SELECT e.id, e.name, e.department, e.role, e.risk_score,
               (SELECT COUNT(*) FROM prompts p WHERE p.employee_id = e.id) AS total_prompts,
               COALESCE(
                   (SELECT esp.ai_skill_score FROM employee_skill_profiles esp WHERE esp.employee_id = e.id),
                   0.0
               ) AS ai_skill_score,
               COALESCE(e.email, '') AS email,
               e.invite_sent_at, e.invite_reminder_sent_at, e.account_claimed_at, e.extension_first_seen_at,
               (SELECT u.username FROM users u WHERE u.employee_id = e.id LIMIT 1) AS linked_username
        FROM employees e
        WHERE e.org_id = ?
        ORDER BY e.name ASC
        """,
        (org_id,),
    )
    return [EmployeeTeamMember(**dict(r)) for r in rows]


@router.post("/invites", response_model=EmployeeInviteCreated)
def create_employee_invite(
    payload: EmployeeInviteCreate,
    current_user: dict = Depends(get_current_user_optional),
) -> EmployeeInviteCreated:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    _require_manager(current_user)
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid work email is required")
    org_id = get_org_id(current_user)
    if fetch_one(
        "SELECT id FROM employees WHERE lower(trim(email)) = ? AND org_id = ? AND COALESCE(trim(email), '') != ''",
        (email, org_id),
    ):
        raise HTTPException(status_code=400, detail="An employee with this email already exists")
    eid = _next_employee_id()
    token = secrets.token_urlsafe(32)
    nm = (payload.name or "").strip() or email.split("@")[0]
    dept = (payload.department or "").strip() or "General"
    role = (payload.role or "").strip() or "employee"
    now = _utc_now()
    execute(
        """
        INSERT INTO employees (
            id, name, department, role, risk_score, email, invite_token, invite_sent_at,
            invite_reminder_sent_at, account_claimed_at, extension_first_seen_at, org_id
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, NULL, ?)
        """,
        (eid, nm, dept, role, email, token, now, org_id),
    )
    base = frontend_base_url().rstrip("/")
    invite_url = f"{base}/register-invite?token={token}&org_id={org_id}"
    send_employee_invite_email(email, invite_url, nm, reminder=False)
    ensure_employee_skill_profile(eid)
    return EmployeeInviteCreated(employee_id=eid, invite_url=invite_url)


@router.patch("/{employee_id}", response_model=EmployeeTeamMember)
def patch_employee(
    employee_id: int,
    payload: EmployeePatch,
    current_user: dict | None = Depends(get_current_user_optional),
) -> EmployeeTeamMember:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    _require_manager(current_user)
    org_id = get_org_id(current_user)
    if not fetch_one("SELECT id FROM employees WHERE id = ? AND org_id = ?", (employee_id, org_id)):
        raise HTTPException(status_code=404, detail="Employee not found")
    sets: list[str] = []
    vals: list[Any] = []
    if v := (payload.name and payload.name.strip()):
        sets.append("name = ?")
        vals.append(v)
    if payload.department is not None and (d := payload.department.strip()):
        sets.append("department = ?")
        vals.append(d)
    if payload.role is not None and (rkey := payload.role.strip()):
        sets.append("role = ?")
        vals.append(rkey)
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")
    vals.append(employee_id)
    execute(f"UPDATE employees SET {', '.join(sets)} WHERE id = ?", tuple(vals))
    process_pending_employee_invite_reminders()
    row = fetch_one(
        """
        SELECT e.id, e.name, e.department, e.role, e.risk_score,
               (SELECT COUNT(*) FROM prompts p WHERE p.employee_id = e.id) AS total_prompts,
               COALESCE(
                   (SELECT esp.ai_skill_score FROM employee_skill_profiles esp WHERE esp.employee_id = e.id),
                   0.0
               ) AS ai_skill_score,
               COALESCE(e.email, '') AS email,
               e.invite_sent_at, e.invite_reminder_sent_at, e.account_claimed_at, e.extension_first_seen_at,
               (SELECT u.username FROM users u WHERE u.employee_id = e.id LIMIT 1) AS linked_username
        FROM employees e
        WHERE e.id = ?
        """,
        (employee_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    return EmployeeTeamMember(**dict(row))


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: int,
    current_user: dict | None = Depends(get_current_user_optional),
) -> dict[str, str]:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    _require_manager(current_user)
    org_id = get_org_id(current_user)
    if not fetch_one("SELECT id FROM employees WHERE id = ? AND org_id = ?", (employee_id, org_id)):
        raise HTTPException(status_code=404, detail="Employee not found")
    delete_employee_cascade(employee_id)
    return {"status": "deleted"}


@router.get("/{employee_id}", response_model=EmployeeDetail)
def get_employee(employee_id: int, current_user: dict | None = Depends(get_current_user_optional)) -> EmployeeDetail:
    _ensure_employee_access(current_user, employee_id)
    row = fetch_one(
        """
        SELECT e.id, e.name, e.department, e.risk_score, COUNT(p.id) AS total_prompts,
               COALESCE(esp.ai_skill_score, 0.0) AS ai_skill_score,
               COALESCE(e.email, '') AS email
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
def get_employee_skill(
    employee_id: int, current_user: dict | None = Depends(get_current_user_optional)
) -> EmployeeSkillProfile:
    _ensure_employee_access(current_user, employee_id)
    row = fetch_one(
        """
        SELECT employee_id, ai_skill_score, skill_class, prompts_evaluated,
               last_strengths_json, last_improvements_json, assigned_lessons_json, updated_at,
               last_coaching_message, last_dimension_scores_json, ai_use_profile_summary
        FROM employee_skill_profiles
        WHERE employee_id = ?
        """,
        (employee_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Employee skill profile not found")
    keys = row.keys()
    dim_raw = row["last_dimension_scores_json"] if "last_dimension_scores_json" in keys else "{}"
    last_dims = loads_json(dim_raw, {})
    if not isinstance(last_dims, dict):
        last_dims = {}
    last_dims = {str(k): float(v) for k, v in last_dims.items() if isinstance(v, (int, float))}

    return EmployeeSkillProfile(
        employee_id=row["employee_id"],
        ai_skill_score=row["ai_skill_score"],
        skill_class=row["skill_class"] if "skill_class" in keys else "developing",
        prompts_evaluated=row["prompts_evaluated"],
        last_strengths=loads_json(row["last_strengths_json"], []),
        last_improvements=loads_json(row["last_improvements_json"], []),
        assigned_lessons=loads_json(row["assigned_lessons_json"] if "assigned_lessons_json" in keys else "[]", []),
        updated_at=row["updated_at"],
        last_coaching_message=str(row["last_coaching_message"] or "") if "last_coaching_message" in keys else "",
        last_dimension_scores=last_dims,
        ai_use_profile_summary=str(row["ai_use_profile_summary"] or "") if "ai_use_profile_summary" in keys else "",
    )


@router.get("/skills/company", response_model=CompanySkillSnapshot)
def get_company_skill_snapshot(current_user: dict = Depends(get_current_user)) -> CompanySkillSnapshot:
    org_id = get_org_id(current_user)
    row = fetch_one(
        """
        SELECT
            COALESCE(AVG(esp.ai_skill_score), 0.0) AS avg_skill,
            COUNT(*) AS employee_count,
            SUM(CASE WHEN esp.ai_skill_score < 0.45 THEN 1 ELSE 0 END) AS low_skill_count,
            SUM(CASE WHEN esp.ai_skill_score >= 0.75 THEN 1 ELSE 0 END) AS high_skill_count
        FROM employee_skill_profiles esp
        JOIN employees e ON e.id = esp.employee_id AND e.org_id = ?
        """,
        (org_id,),
    )
    return CompanySkillSnapshot(
        average_skill_score=round(float(row["avg_skill"] or 0.0), 3),
        employees_tracked=int(row["employee_count"] or 0),
        low_skill_employees=int(row["low_skill_count"] or 0),
        high_skill_employees=int(row["high_skill_count"] or 0),
    )


@router.get("/skills/curriculum/outline", response_model=list[CurriculumUnitOutline])
def curriculum_outline() -> list[CurriculumUnitOutline]:
    rows = fetch_rows(
        """
        SELECT id, title, objective, skill_class, sequence_order, lesson_kind, unit_title
        FROM skill_lessons
        WHERE is_active = 1 AND lesson_source = 'exported_curriculum'
        AND COALESCE(lesson_kind, 'lesson') != 'quiz'
        ORDER BY sequence_order ASC, id ASC
        """
    )
    by_unit: dict[str, dict[str, Any]] = {}
    for row in rows:
        ut = (row["unit_title"] or "").strip() or "General"
        if ut not in by_unit:
            by_unit[ut] = {"unit_title": ut, "skill_class": row["skill_class"], "lessons": []}
        by_unit[ut]["lessons"].append(
            {
                "id": int(row["id"]),
                "title": row["title"],
                "lesson_kind": row["lesson_kind"] or "lesson",
                "sequence_order": int(row["sequence_order"] or 0),
                "objective": (row["objective"] or "")[:500],
            }
        )
    units = [CurriculumUnitOutline(**u) for u in by_unit.values()]
    units.sort(key=lambda u: min((x.sequence_order for x in u.lessons), default=999999))
    return units


@router.get("/skills/curriculum/lessons/{lesson_id}", response_model=SkillLesson)
def get_curriculum_lesson_detail(lesson_id: int) -> SkillLesson:
    row = fetch_one(
        """
        SELECT id, skill_class, title, objective, content, is_active, sequence_order, lesson_kind, unit_title,
               lesson_source
        FROM skill_lessons
        WHERE id = ? AND is_active = 1 AND lesson_source = 'exported_curriculum'
        AND COALESCE(lesson_kind, 'lesson') != 'quiz'
        """,
        (lesson_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Curriculum lesson not found")
    data = dict(row)
    data["is_active"] = bool(data["is_active"])
    if data.get("sequence_order") is not None:
        data["sequence_order"] = int(data["sequence_order"])
    return SkillLesson(**data)


@router.get("/{employee_id}/skill/curriculum/progress", response_model=CurriculumProgressResponse)
def get_employee_curriculum_progress(
    employee_id: int, current_user: dict | None = Depends(get_current_user_optional)
) -> CurriculumProgressResponse:
    _ensure_employee_self_or_manager(current_user, employee_id)
    if not fetch_one("SELECT id FROM employees WHERE id = ?", (employee_id,)):
        raise HTTPException(status_code=404, detail="Employee not found")
    d = curriculum_progress_counts(employee_id)
    return CurriculumProgressResponse(
        total_curriculum_lessons=d["total_curriculum_lessons"],
        completed_curriculum=d["completed_curriculum"],
        next_lesson_id=d["next_lesson_id"],
    )


@router.get("/skills/lessons", response_model=list[SkillLesson])
def list_skill_lessons(skill_class: str | None = None) -> list[SkillLesson]:
    order = "ORDER BY COALESCE(sequence_order, id) ASC, id ASC"
    cols = "id, skill_class, title, objective, content, is_active, sequence_order, lesson_kind, unit_title, lesson_source"
    if skill_class:
        rows = fetch_rows(
            f"SELECT {cols} FROM skill_lessons WHERE is_active = 1 AND skill_class = ? {order}",
            (skill_class,),
        )
    else:
        rows = fetch_rows(f"SELECT {cols} FROM skill_lessons WHERE is_active = 1 {order}")
    lessons: list[SkillLesson] = []
    for row in rows:
        lesson_data = dict(row)
        lesson_data["is_active"] = bool(lesson_data["is_active"])
        for k in ("sequence_order",):
            if k in lesson_data and lesson_data[k] is not None:
                lesson_data[k] = int(lesson_data[k])
        lessons.append(SkillLesson(**lesson_data))
    return lessons


@router.post("/{employee_id}/skill/lessons/auto-assign", response_model=list[EmployeeLessonStatus])
def auto_assign_skill_lessons(
    employee_id: int,
    need_based: bool = Query(False, description="Also assign extra curriculum when employee risk is elevated"),
    current_user: dict | None = Depends(get_current_user_optional),
) -> list[EmployeeLessonStatus]:
    _ensure_employee_self_or_manager(current_user, employee_id)
    employee = fetch_one("SELECT id FROM employees WHERE id = ?", (employee_id,))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    ensure_employee_skill_profile(employee_id)
    prof = fetch_one("SELECT skill_class FROM employee_skill_profiles WHERE employee_id = ?", (employee_id,))
    sk = (prof["skill_class"] if prof else None) or "developing"
    if not assign_next_curriculum_lesson(employee_id):
        ensure_initial_lesson_if_none_pending(employee_id, sk)
    if need_based:
        emp = fetch_one("SELECT risk_score FROM employees WHERE id = ?", (employee_id,))
        rs = float(emp["risk_score"] or 0.0) if emp else 0.0
        assign_stack_for_need(employee_id, risk_score=rs)
    pending = fetch_rows(
        "SELECT lesson_id FROM employee_lessons WHERE employee_id = ? AND status = 'assigned' ORDER BY id DESC",
        (employee_id,),
    )
    execute(
        "UPDATE employee_skill_profiles SET assigned_lessons_json = ? WHERE employee_id = ?",
        (json.dumps([str(r["lesson_id"]) for r in pending]), employee_id),
    )
    return list_employee_lessons(employee_id)


@router.post("/{employee_id}/skill/lessons/assign", response_model=EmployeeLessonStatus)
def assign_skill_lesson(employee_id: int, payload: SkillLessonAssignRequest, _current_user: dict = Depends(require_ops_manager)) -> EmployeeLessonStatus:
    employee = fetch_one("SELECT id FROM employees WHERE id = ?", (employee_id,))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    lesson = fetch_one(
        "SELECT id, title, lesson_kind FROM skill_lessons WHERE id = ? AND is_active = 1",
        (payload.lesson_id,),
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Skill lesson not found")
    if (lesson["lesson_kind"] or "lesson") == "quiz":
        raise HTTPException(status_code=400, detail="Quiz modules are not assignable; use content lessons only.")
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
        "INSERT INTO employee_lessons (employee_id, lesson_id, status, assigned_at) VALUES (?, ?, 'assigned', ?)",
        (employee_id, payload.lesson_id, _utc_now()),
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
def complete_skill_lesson(
    employee_id: int,
    payload: SkillLessonCompleteRequest,
    current_user: dict | None = Depends(get_current_user_optional),
) -> EmployeeLessonStatus:
    _ensure_employee_self_or_manager(current_user, employee_id)
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
    ensure_employee_skill_profile(employee_id)
    execute(
        "UPDATE employee_lessons SET status = 'completed', completed_at = ? WHERE employee_id = ? AND lesson_id = ?",
        (_utc_now(), employee_id, payload.lesson_id),
    )
    assign_next_curriculum_lesson(employee_id)
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
        SELECT el.lesson_id, sl.title, el.status, el.assigned_at, el.completed_at,
               sl.unit_title, sl.lesson_kind, sl.lesson_source
        FROM employee_lessons el
        INNER JOIN skill_lessons sl ON sl.id = el.lesson_id
        WHERE el.employee_id = ?
        ORDER BY el.id DESC
        """,
        (employee_id,),
    )
    return [EmployeeLessonStatus(**dict(row)) for row in rows]


@router.get("/{employee_id}/memory", response_model=EmployeeMemorySnapshot)
def get_employee_memory_snapshot(
    employee_id: int, current_user: dict | None = Depends(get_current_user_optional)
) -> EmployeeMemorySnapshot:
    _ensure_employee_access(current_user, employee_id)
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
def list_employee_memory_events(
    employee_id: int,
    limit: int = 50,
    current_user: dict | None = Depends(get_current_user_optional),
) -> list[EmployeeMemoryEvent]:
    _ensure_employee_access(current_user, employee_id)
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
