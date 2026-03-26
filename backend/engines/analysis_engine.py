from database import create_alert, create_prompt_record, execute, fetch_one, record_skill_evaluation
from detectors.pii_detector import detect_pii
from detectors.policy_detector import detect_policy_violations
from detectors.secrets_detector import detect_secrets
from detectors.shadow_ai_detector import detect_shadow_ai
from engines.action_engine import choose_action, choose_risk_level
from engines.coaching_engine import coaching_tip, evaluate_prompt_skill, redact_prompt
from engines.policy_engine import policy_enforcement
from models import (
    ActionType,
    AnalyzeRequest,
    AnalyzeResponse,
    Detection,
    DetectionLayer,
    RiskLevel,
)


def _role_for_employee(employee_id: int) -> str:
    row = fetch_one("SELECT role FROM employees WHERE id = ?", (employee_id,))
    return row["role"] if row else "employee"


def _persist_detections(prompt_id: int, detections: list[Detection]) -> None:
    for detection in detections:
        execute(
            """
            INSERT INTO detections (
                prompt_id, type, subtype, severity, detail, span_start, span_end, confidence, layer
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prompt_id,
                detection.type.value,
                detection.subtype,
                detection.severity.value,
                detection.detail,
                detection.span[0],
                detection.span[1],
                detection.confidence,
                detection.layer.value,
            ),
        )


def analyze_prompt(payload: AnalyzeRequest) -> AnalyzeResponse:
    detections: list[Detection] = []
    detections.extend(detect_pii(payload.prompt_text))
    detections.extend(detect_secrets(payload.prompt_text))
    detections.extend(detect_policy_violations(payload.prompt_text))
    shadow_hits, tool_domain = detect_shadow_ai(payload.target_tool)
    detections.extend(shadow_hits)

    role = _role_for_employee(payload.employee_id)
    detections = policy_enforcement(role, payload.prompt_text, detections)

    risk_level = choose_risk_level(detections)
    action = choose_action(risk_level)
    redacted = redact_prompt(payload.prompt_text, detections) if action == ActionType.redact else None
    skill = evaluate_prompt_skill(payload.prompt_text, detections)
    tip = coaching_tip(action, detections, skill)

    layer_used = DetectionLayer.l1
    confidence = 0.95 if detections else 0.99
    estimated_cost = 0.0

    prompt_id = create_prompt_record(
        employee_id=payload.employee_id,
        prompt_text=payload.prompt_text,
        redacted_prompt=redacted,
        target_tool=payload.target_tool,
        risk_level=risk_level,
        action=action,
        layer_used=layer_used.value,
        confidence=confidence,
        estimated_cost_usd=estimated_cost,
        coaching_tip=tip,
        metadata=payload.metadata,
    )
    _persist_detections(prompt_id, detections)
    record_skill_evaluation(
        employee_id=payload.employee_id,
        prompt_id=prompt_id,
        overall_score=skill.overall_score,
        dimension_scores=skill.dimension_scores,
        strengths=skill.strengths,
        improvements=skill.improvements,
    )

    if tool_domain and shadow_hits:
        execute(
            "INSERT INTO shadow_ai_events (employee_id, tool_domain, risk_level, created_at) VALUES (?, ?, ?, datetime('now'))",
            (payload.employee_id, tool_domain, RiskLevel.high.value),
        )

    if action in {ActionType.block, ActionType.quarantine}:
        create_alert("security_event", risk_level, f"Prompt {prompt_id} required {action.value}.")

    return AnalyzeResponse(
        prompt_id=prompt_id,
        risk_level=risk_level,
        action=action,
        detections=detections,
        coaching_tip=tip,
        redacted_prompt=redacted,
        layer_used=layer_used,
        confidence=confidence,
        estimated_cost_usd=estimated_cost,
        skill_evaluation=skill,
    )
