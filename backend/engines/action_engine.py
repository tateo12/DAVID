from models import ActionType, Detection, RiskLevel


def choose_risk_level(detections: list[Detection]) -> RiskLevel:
    if not detections:
        return RiskLevel.low

    ordering = {
        RiskLevel.low: 0,
        RiskLevel.medium: 1,
        RiskLevel.high: 2,
        RiskLevel.critical: 3,
    }
    return max(detections, key=lambda d: ordering[d.severity]).severity


def choose_action(risk_level: RiskLevel) -> ActionType:
    if risk_level == RiskLevel.critical:
        return ActionType.block
    if risk_level == RiskLevel.high:
        return ActionType.redact
    if risk_level == RiskLevel.medium:
        return ActionType.allow
    return ActionType.allow
