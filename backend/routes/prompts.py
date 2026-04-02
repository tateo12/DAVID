from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, get_current_user_optional, get_org_id
from database import fetch_one, fetch_rows
from models import Detection, PromptDetail, PromptSummary

router = APIRouter(prefix="/prompts", tags=["prompts"])

_LIST_SQL = """
        SELECT p.id, p.employee_id, COALESCE(u.username, e.name) AS employee_name, p.risk_level, p.action, p.target_tool, p.prompt_text, p.created_at
        FROM prompts p
        LEFT JOIN employees e ON e.id = p.employee_id
        LEFT JOIN users u ON u.employee_id = p.employee_id
        """


@router.get("", response_model=list[PromptSummary])
def list_prompts(
    limit: int = Query(default=50, ge=1, le=500),
    current_user: dict | None = Depends(get_current_user_optional),
) -> list[PromptSummary]:
    org_id = get_org_id(current_user) if current_user else 1
    if current_user and current_user.get("role") == "employee":
        eid = current_user.get("employee_id")
        if eid is None:
            return []
        rows = fetch_rows(
            f"""
            {_LIST_SQL}
            WHERE p.employee_id = ? AND e.org_id = ?
            ORDER BY p.id DESC
            LIMIT ?
            """,
            (eid, org_id, limit),
        )
    else:
        rows = fetch_rows(
            f"""
            {_LIST_SQL}
            WHERE e.org_id = ?
            ORDER BY p.id DESC
            LIMIT ?
            """,
            (org_id, limit),
        )
    return [PromptSummary(**dict(row)) for row in rows]


@router.get("/{prompt_id}", response_model=PromptDetail)
def get_prompt(prompt_id: int, current_user: dict = Depends(get_current_user)) -> PromptDetail:
    org_id = get_org_id(current_user)
    row = fetch_one(
        "SELECT p.* FROM prompts p JOIN employees e ON e.id = p.employee_id WHERE p.id = ? AND e.org_id = ?",
        (prompt_id, org_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Employees can only view their own prompts; managers/admins can view any.
    if current_user.get("role") == "employee":
        if row["employee_id"] != current_user.get("employee_id"):
            raise HTTPException(status_code=403, detail="Access denied")

    detection_rows = fetch_rows(
        """
        SELECT type, subtype, severity, detail, span_start, span_end, confidence, layer
        FROM detections
        WHERE prompt_id = ?
        """,
        (prompt_id,),
    )
    detections = [
        Detection(
            type=d["type"],
            subtype=d["subtype"],
            severity=d["severity"],
            detail=d["detail"],
            span=(d["span_start"], d["span_end"]),
            confidence=d["confidence"],
            layer=d["layer"],
        )
        for d in detection_rows
    ]
    return PromptDetail(
        id=row["id"],
        employee_id=row["employee_id"],
        risk_level=row["risk_level"],
        action=row["action"],
        target_tool=row["target_tool"],
        created_at=row["created_at"],
        prompt_text=row["prompt_text"],
        redacted_prompt=row["redacted_prompt"],
        detections=detections,
        coaching_tip=row["coaching_tip"],
    )
