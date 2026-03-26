from database import (
    create_alert,
    create_prompt_record,
    execute,
    fetch_one,
    record_employee_interaction_memory,
    record_skill_evaluation,
)
from config import get_settings
from detectors.pii_detector import detect_pii
from detectors.policy_detector import detect_policy_violations
from detectors.secrets_detector import detect_secrets
from detectors.shadow_ai_detector import detect_shadow_ai
from engines.action_engine import choose_action, choose_risk_level
from engines.agents.l2_classifier_agent import L2ClassifierAgent
from engines.agents.l3_judgment_agent import L3JudgmentAgent
from engines.coaching_engine import (
    assess_intent_and_recommendations,
    coaching_tip,
    evaluate_prompt_skill,
    redact_prompt,
)
from engines.policy_engine import policy_enforcement
from models import (
    ActionType,
    AttachmentContext,
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


def _with_source(detections: list[Detection], source: str) -> list[Detection]:
    return [detection.model_copy(update={"source": source}) for detection in detections]


def _analyze_text_source(text: str, source: str, role: str) -> list[Detection]:
    if not text.strip():
        return []

    detections: list[Detection] = []
    detections.extend(_with_source(detect_pii(text), source))
    detections.extend(_with_source(detect_secrets(text), source))
    detections.extend(_with_source(detect_policy_violations(text), source))
    detections = _with_source(policy_enforcement(role, text, detections), source)
    return detections


def _attachment_text(attachment: AttachmentContext) -> str:
    return (attachment.extracted_text or "").strip()


def _base_confidence_for_detections(detections: list[Detection]) -> float:
    if not detections:
        return 0.99
    avg_conf = sum(detection.confidence for detection in detections) / len(detections)
    # Penalize broad multi-hit scenarios slightly; they are often noisier regex matches.
    volume_penalty = min(0.08, max(0, len(detections) - 3) * 0.01)
    return max(0.55, min(0.99, avg_conf - volume_penalty))


def _needs_l2_review(
    prompt_text: str,
    detections: list[Detection],
    risk_level: RiskLevel,
    l1_confidence: float,
    attachment_count: int,
) -> bool:
    settings = get_settings()
    if not settings.enable_l2:
        return False
    # Always run L2 — every prompt gets AI classification
    return True


def _needs_l3_review(
    risk_level: RiskLevel,
    detections: list[Detection],
    confidence: float,
    l2_applied: bool,
    l2_added_count: int,
    l2_adjustment: str | None,
) -> bool:
    settings = get_settings()
    if not settings.enable_l3:
        return False
    # Run L3 on anything that isn't clearly safe
    if detections:
        return True
    if l2_applied:
        return True
    if risk_level != RiskLevel.low:
        return True
    if confidence < 0.95:
        return True
    return False


def analyze_prompt(payload: AnalyzeRequest) -> AnalyzeResponse:
    role = _role_for_employee(payload.employee_id)

    detections: list[Detection] = _analyze_text_source(payload.prompt_text, "prompt", role)
    for idx, attachment in enumerate(payload.attachments):
        attachment_text = _attachment_text(attachment)
        source = f"attachment:{idx}:{attachment.filename}"
        detections.extend(_analyze_text_source(attachment_text, source, role))

    shadow_hits, tool_domain = detect_shadow_ai(payload.target_tool)
    detections.extend(_with_source(shadow_hits, "tool"))

    risk_level = choose_risk_level(detections)
    action = choose_action(risk_level)
    layer_used = DetectionLayer.l1
    confidence = _base_confidence_for_detections(detections)
    estimated_cost = 0.0

    l2_agent = L2ClassifierAgent()
    l3_agent = L3JudgmentAgent()

    should_run_l2 = _needs_l2_review(
        prompt_text=payload.prompt_text,
        detections=detections,
        risk_level=risk_level,
        l1_confidence=confidence,
        attachment_count=len(payload.attachments),
    )
    l2_result = l2_agent.run(payload.prompt_text, detections, confidence) if should_run_l2 else None
    if l2_result and l2_result.applied:
        if l2_result.additional_detections:
            detections.extend(_with_source(l2_result.additional_detections, "prompt"))
            risk_level = choose_risk_level(detections)
            action = choose_action(risk_level)
            confidence = max(0.6, min(confidence, 0.9))
            layer_used = DetectionLayer.l2
        estimated_cost += l2_result.estimated_cost_usd if l2_result.estimated_cost_usd > 0 else 0.001

    should_run_l3 = _needs_l3_review(
        risk_level=risk_level,
        detections=detections,
        confidence=confidence,
        l2_applied=bool(l2_result and l2_result.applied),
        l2_added_count=len(l2_result.additional_detections) if l2_result else 0,
        l2_adjustment=l2_result.risk_adjustment if l2_result else None,
    )
    l3_result = l3_agent.run(payload.prompt_text, risk_level, action, detections) if should_run_l3 else None
    if l3_result and l3_result.applied and l3_result.risk_level and l3_result.action and l3_result.confidence is not None:
        risk_level = l3_result.risk_level
        action = l3_result.action
        confidence = l3_result.confidence
        layer_used = DetectionLayer.l3
        estimated_cost += l3_result.estimated_cost_usd if l3_result.estimated_cost_usd > 0 else 0.01

    prompt_detections = [detection for detection in detections if detection.source == "prompt"]
    redacted = redact_prompt(payload.prompt_text, prompt_detections) if action == ActionType.redact else None
    skill = evaluate_prompt_skill(payload.prompt_text, detections)
    tip = coaching_tip(action, detections, skill)
    intent_assessment, warning_reasons, safer_alternatives = assess_intent_and_recommendations(
        payload.prompt_text,
        detections,
        attachment_count=len(payload.attachments),
    )

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
    record_employee_interaction_memory(
        employee_id=payload.employee_id,
        prompt_id=prompt_id,
        risk_level=risk_level.value,
        action=action.value,
        skill_score=skill.overall_score,
        skill_class=skill.skill_class,
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
        warning_reasons=warning_reasons,
        safer_alternatives=safer_alternatives,
        intent_assessment=intent_assessment,
    )
