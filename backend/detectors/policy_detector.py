from models import Detection, DetectionLayer, DetectionType, RiskLevel


FORBIDDEN_TERMS = ["confidential", "internal-only", "customer list", "private roadmap"]


def detect_policy_violations(text: str) -> list[Detection]:
    lowered = text.lower()
    detections: list[Detection] = []
    for term in FORBIDDEN_TERMS:
        idx = lowered.find(term)
        if idx >= 0:
            detections.append(
                Detection(
                    type=DetectionType.policy,
                    subtype="confidential_project",
                    severity=RiskLevel.high,
                    detail=f"Potential policy violation: '{term}'",
                    span=(idx, idx + len(term)),
                    confidence=0.85,
                    layer=DetectionLayer.l1,
                )
            )
    return detections
