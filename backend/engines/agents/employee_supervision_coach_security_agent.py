from detectors.pii_detector import detect_pii
from detectors.secrets_detector import detect_secrets
from detectors.shadow_ai_detector import detect_shadow_ai
from engines.coaching_engine import coaching_tip, evaluate_prompt_skill, redact_prompt
from engines.agents.contracts import CoachingResult, EmployeeSupervisionResult
from models import ActionType, AnalyzeRequest, Detection, RiskLevel


class EmployeeSupervisionCoachSecurityAgent:
    name = "EmployeeSupervisionCoachSecurityAgent"

    def run_security_exam(self, payload: AnalyzeRequest) -> EmployeeSupervisionResult:
        detections: list[Detection] = []
        detections.extend(detect_pii(payload.prompt_text))
        detections.extend(detect_secrets(payload.prompt_text))
        shadow_hits, tool_domain = detect_shadow_ai(payload.target_tool)
        detections.extend(shadow_hits)
        security_exam = {
            "pii_hits": sum(1 for d in detections if d.type.value == "pii"),
            "secret_hits": sum(1 for d in detections if d.type.value == "secret"),
            "shadow_ai_hits": len(shadow_hits),
        }
        return EmployeeSupervisionResult(
            detections=detections,
            tool_domain=tool_domain,
            security_exam=security_exam,
        )

    def run_smart_coaching(self, prompt_text: str, detections: list[Detection], action: ActionType) -> CoachingResult:
        skill = evaluate_prompt_skill(prompt_text, detections)
        tip = coaching_tip(action, detections, skill)
        redacted = redact_prompt(prompt_text, detections) if action == ActionType.redact else None
        return CoachingResult(skill=skill, tip=tip, redacted_prompt=redacted)

    @staticmethod
    def summarize_risk_examination(detections: list[Detection]) -> dict[str, int]:
        return {
            "critical": sum(1 for d in detections if d.severity == RiskLevel.critical),
            "high": sum(1 for d in detections if d.severity == RiskLevel.high),
            "medium": sum(1 for d in detections if d.severity == RiskLevel.medium),
            "low": sum(1 for d in detections if d.severity == RiskLevel.low),
        }
