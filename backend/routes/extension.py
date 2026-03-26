import json
from hashlib import sha256
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import create_captured_turn_record, create_extension_warning_event, fetch_one, fetch_rows
from engines.analysis_engine import analyze_prompt
from models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ExtensionCaptureRequest,
    ExtensionTurnCaptureRequest,
    ExtensionTurnCaptureResponse,
    RiskLevel,
)

router = APIRouter(prefix="/extension", tags=["extension"])


def _resolve_effective_employee_id(payload_employee_id: int | None, current_user: dict) -> int:
    user_role = current_user["role"]
    employee_id = current_user.get("employee_id")
    if user_role == "employee":
        if not employee_id:
            raise HTTPException(status_code=403, detail="Employee account is not mapped to an employee profile")
        return employee_id
    if user_role == "manager":
        if not payload_employee_id:
            raise HTTPException(status_code=400, detail="Managers must provide employee_id")
        return payload_employee_id
    raise HTTPException(status_code=403, detail="Role not allowed for extension capture")


def _warning_threshold_for_role(role: str) -> RiskLevel:
    rows = fetch_rows(
        "SELECT role, rule_json FROM policies WHERE role = ? OR role = 'all' ORDER BY role DESC",
        (role,),
    )
    merged: dict = {}
    for row in rows:
        merged.update(json.loads(row["rule_json"]))
    configured = str(merged.get("extension_warning_threshold", "high")).lower()
    if configured in {RiskLevel.low.value, RiskLevel.medium.value, RiskLevel.high.value, RiskLevel.critical.value}:
        return RiskLevel(configured)
    return RiskLevel.high


def _risk_meets_threshold(risk_level: RiskLevel, threshold: RiskLevel) -> bool:
    ordering = {
        RiskLevel.low: 0,
        RiskLevel.medium: 1,
        RiskLevel.high: 2,
        RiskLevel.critical: 3,
    }
    return ordering[risk_level] >= ordering[threshold]


def _policy_role_for_employee(employee_id: int) -> str:
    row = fetch_one("SELECT role FROM employees WHERE id = ?", (employee_id,))
    return str(row["role"]) if row else "employee"


def _attachment_audit_entries(payload: ExtensionCaptureRequest | ExtensionTurnCaptureRequest) -> list[dict]:
    entries: list[dict] = []
    for attachment in payload.attachments:
        extracted_text = attachment.extracted_text or ""
        entries.append(
            {
                "filename": attachment.filename,
                "mime_type": attachment.mime_type,
                "size_bytes": attachment.size_bytes,
                "source": attachment.source,
                "extraction_status": attachment.extraction_status,
                "extracted_text_len": len(extracted_text),
                "extracted_text_sha256": sha256(extracted_text.encode("utf-8")).hexdigest() if extracted_text else None,
            }
        )
    return entries


@router.post("/capture", response_model=AnalyzeResponse)
def extension_capture(payload: ExtensionCaptureRequest, current_user: dict = Depends(get_current_user)) -> AnalyzeResponse:
    effective_employee_id = _resolve_effective_employee_id(payload.employee_id, current_user)
    effective_role = _policy_role_for_employee(effective_employee_id)
    threshold = _warning_threshold_for_role(effective_role)

    analyze_payload = AnalyzeRequest(
        employee_id=effective_employee_id,
        prompt_text=payload.prompt_text,
        target_tool=payload.target_tool,
        attachments=payload.attachments,
        metadata={
            "source": "browser_extension",
            "attachments_count": len(payload.attachments),
            "attachments_audit": _attachment_audit_entries(payload),
            "warning_confirmed": payload.warning_confirmed,
            "warning_context_id": payload.warning_context_id,
            **(payload.metadata or {}),
        },
    )
    analysis = analyze_prompt(analyze_payload)

    requires_confirmation = (
        not payload.warning_confirmed
        and _risk_meets_threshold(analysis.risk_level, threshold)
        and bool(analysis.detections)
    )
    if requires_confirmation:
        warning_context_id = str(uuid4())
        create_extension_warning_event(
            employee_id=effective_employee_id,
            warning_context_id=warning_context_id,
            event_type="warning_issued",
            risk_level=analysis.risk_level.value,
            target_tool=payload.target_tool,
            details={
                "reason_count": len(analysis.warning_reasons),
                "target_tool": payload.target_tool,
            },
        )
        return analysis.model_copy(
            update={
                "requires_confirmation": True,
                "warning_context_id": warning_context_id,
            }
        )

    if payload.warning_confirmed:
        if not payload.warning_context_id:
            raise HTTPException(status_code=400, detail="warning_context_id is required when warning_confirmed=true")
        create_extension_warning_event(
            employee_id=effective_employee_id,
            warning_context_id=payload.warning_context_id,
            event_type="warning_confirmed",
            risk_level=analysis.risk_level.value,
            target_tool=payload.target_tool,
            details={"target_tool": payload.target_tool},
        )
        return analysis.model_copy(
            update={
                "requires_confirmation": False,
                "warning_context_id": payload.warning_context_id,
            }
        )

    return analysis


@router.post("/capture-turn", response_model=ExtensionTurnCaptureResponse)
def extension_capture_turn(
    payload: ExtensionTurnCaptureRequest,
    current_user: dict = Depends(get_current_user),
) -> ExtensionTurnCaptureResponse:
    effective_employee_id = _resolve_effective_employee_id(payload.employee_id, current_user)

    prompt_analysis = analyze_prompt(
        AnalyzeRequest(
            employee_id=effective_employee_id,
            prompt_text=payload.prompt_text,
            target_tool=payload.target_tool,
            attachments=payload.attachments,
            metadata={
                "source": "browser_extension",
                "event_type": "user_prompt_turn",
                "conversation_id": payload.conversation_id,
                "turn_id": payload.turn_id,
                "attachments_count": len(payload.attachments),
                "attachments_audit": _attachment_audit_entries(payload),
                **(payload.metadata or {}),
            },
        )
    )
    output_analysis = analyze_prompt(
        AnalyzeRequest(
            employee_id=effective_employee_id,
            prompt_text=payload.ai_output_text,
            target_tool=payload.target_tool,
            attachments=[],
            metadata={
                "source": "browser_extension",
                "event_type": "ai_output_turn",
                "conversation_id": payload.conversation_id,
                "turn_id": payload.turn_id,
                **(payload.metadata or {}),
            },
        )
    )
    create_captured_turn_record(
        employee_id=effective_employee_id,
        target_tool=payload.target_tool,
        conversation_id=payload.conversation_id,
        turn_id=payload.turn_id,
        prompt_prompt_id=prompt_analysis.prompt_id,
        output_prompt_id=output_analysis.prompt_id,
        metadata={
            **(payload.metadata or {}),
            "attachments_count": len(payload.attachments),
            "attachments_audit": _attachment_audit_entries(payload),
        },
    )
    return ExtensionTurnCaptureResponse(
        prompt_analysis=prompt_analysis,
        output_analysis=output_analysis,
    )
