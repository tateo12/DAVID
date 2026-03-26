from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import create_captured_turn_record
from engines.analysis_engine import analyze_prompt
from models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ExtensionCaptureRequest,
    ExtensionTurnCaptureRequest,
    ExtensionTurnCaptureResponse,
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


@router.post("/capture", response_model=AnalyzeResponse)
def extension_capture(payload: ExtensionCaptureRequest, current_user: dict = Depends(get_current_user)) -> AnalyzeResponse:
    effective_employee_id = _resolve_effective_employee_id(payload.employee_id, current_user)

    analyze_payload = AnalyzeRequest(
        employee_id=effective_employee_id,
        prompt_text=payload.prompt_text,
        target_tool=payload.target_tool,
        metadata={
            "source": "browser_extension",
            **(payload.metadata or {}),
        },
    )
    return analyze_prompt(analyze_payload)


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
            metadata={
                "source": "browser_extension",
                "event_type": "user_prompt_turn",
                "conversation_id": payload.conversation_id,
                "turn_id": payload.turn_id,
                **(payload.metadata or {}),
            },
        )
    )
    output_analysis = analyze_prompt(
        AnalyzeRequest(
            employee_id=effective_employee_id,
            prompt_text=payload.ai_output_text,
            target_tool=payload.target_tool,
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
        metadata=payload.metadata,
    )
    return ExtensionTurnCaptureResponse(
        prompt_analysis=prompt_analysis,
        output_analysis=output_analysis,
    )
