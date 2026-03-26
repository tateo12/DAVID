from fastapi import APIRouter, HTTPException, Query

from database import fetch_one, fetch_rows
from models import Detection, PromptDetail, PromptSummary

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptSummary])
def list_prompts(limit: int = Query(default=50, ge=1, le=500)) -> list[PromptSummary]:
    rows = fetch_rows(
        """
        SELECT p.id, p.employee_id, COALESCE(u.username, e.name) AS employee_name, p.risk_level, p.action, p.target_tool, p.prompt_text, p.created_at
        FROM prompts p
        LEFT JOIN employees e ON e.id = p.employee_id
        LEFT JOIN users u ON u.employee_id = p.employee_id
        ORDER BY p.id DESC
        LIMIT ?
        """,
        (limit,),
    )
    return [PromptSummary(**dict(row)) for row in rows]


@router.get("/{prompt_id}", response_model=PromptDetail)
def get_prompt(prompt_id: int) -> PromptDetail:
    row = fetch_one("SELECT * FROM prompts WHERE id = ?", (prompt_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found")

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
