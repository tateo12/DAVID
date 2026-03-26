import re

from models import Detection, DetectionLayer, DetectionType, RiskLevel


SECRET_PATTERNS = [
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "aws_access_key", RiskLevel.critical),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "api_key", RiskLevel.high),
    (re.compile(r"(?i)\bpassword\s*[:=]\s*['\"]?.+['\"]?"), "password", RiskLevel.high),
    (re.compile(r"(?i)\b(token|secret|connection_string|api_key|apikey)\s*[:=]\s*['\"]?.+['\"]?"), "secret", RiskLevel.high),
    # Generic long hex/base64 strings that look like keys
    (re.compile(r"\b[A-Za-z0-9+/]{40,}={0,2}\b"), "possible_key", RiskLevel.medium),
    # Connection strings
    (re.compile(r"(?i)(mongodb|postgres|mysql|redis|amqp)://\S+"), "connection_string", RiskLevel.critical),
    # Bearer tokens
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"), "bearer_token", RiskLevel.high),
]

SECRET_KEYWORDS = [
    ("password", "password_mention", RiskLevel.high),
    ("api key", "api_key_mention", RiskLevel.high),
    ("secret key", "secret_key_mention", RiskLevel.high),
    ("access token", "token_mention", RiskLevel.high),
    ("private key", "private_key_mention", RiskLevel.critical),
    ("credentials", "credentials_mention", RiskLevel.high),
    ("connection string", "connection_string_mention", RiskLevel.high),
    (".env file", "env_file", RiskLevel.high),
    ("ssh key", "ssh_key", RiskLevel.critical),
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

    lowered = text.lower()
    for keyword, subtype, severity in SECRET_KEYWORDS:
        idx = lowered.find(keyword)
        if idx >= 0:
            detections.append(
                Detection(
                    type=DetectionType.secret,
                    subtype=subtype,
                    severity=severity,
                    detail=f"Prompt mentions '{keyword}' — potential secret exposure.",
                    span=(idx, idx + len(keyword)),
                    confidence=0.85,
                    layer=DetectionLayer.l1,
                )
            )

    return detections
