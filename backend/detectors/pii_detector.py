import re

from models import Detection, DetectionLayer, DetectionType, RiskLevel


SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_PATTERN = re.compile(r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
CC_PATTERN = re.compile(r"\b(?:\d[ -]*?){13,16}\b")


def detect_pii(text: str) -> list[Detection]:
    detections: list[Detection] = []
    for pattern, subtype, severity in [
        (SSN_PATTERN, "ssn", RiskLevel.critical),
        (EMAIL_PATTERN, "email", RiskLevel.medium),
        (PHONE_PATTERN, "phone", RiskLevel.medium),
        (CC_PATTERN, "credit_card", RiskLevel.high),
    ]:
        for match in pattern.finditer(text):
            detections.append(
                Detection(
                    type=DetectionType.pii,
                    subtype=subtype,
                    severity=severity,
                    detail=f"Detected possible {subtype}.",
                    span=(match.start(), match.end()),
                    confidence=0.93,
                    layer=DetectionLayer.l1,
                )
            )
    return detections
