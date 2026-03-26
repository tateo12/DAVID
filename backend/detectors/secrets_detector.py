import re

from models import Detection, DetectionLayer, DetectionType, RiskLevel


SECRET_PATTERNS = [
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "aws_access_key", RiskLevel.critical),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "api_key", RiskLevel.high),
    (re.compile(r"(?i)\bpassword\s*[:=]\s*['\"]?.+['\"]?"), "password", RiskLevel.high),
    (re.compile(r"(?i)\b(token|secret|connection_string)\s*[:=]\s*['\"]?.+['\"]?"), "secret", RiskLevel.high),
]


def detect_secrets(text: str) -> list[Detection]:
    detections: list[Detection] = []
    for pattern, subtype, severity in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            detections.append(
                Detection(
                    type=DetectionType.secret,
                    subtype=subtype,
                    severity=severity,
                    detail=f"Detected possible {subtype} exposure.",
                    span=(match.start(), match.end()),
                    confidence=0.9,
                    layer=DetectionLayer.l1,
                )
            )
    return detections
