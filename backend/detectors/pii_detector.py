import re

from models import Detection, DetectionLayer, DetectionType, RiskLevel


# SSN: with dashes, spaces, or no separators (9 digits)
SSN_PATTERN = re.compile(r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b")
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_PATTERN = re.compile(r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
CC_PATTERN = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
# Names followed by identifying context
NAME_ID_PATTERN = re.compile(r"(?i)\b(?:employee|customer|patient|client|user)\s+(?:named?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+")

# Keyword triggers — intent to share PII
PII_KEYWORDS = [
    ("social security", "ssn_mention", RiskLevel.critical),
    ("social #", "ssn_mention", RiskLevel.critical),
    ("ssn", "ssn_mention", RiskLevel.critical),
    ("date of birth", "dob", RiskLevel.high),
    ("passport number", "passport", RiskLevel.critical),
    ("driver's license", "drivers_license", RiskLevel.high),
    ("drivers license", "drivers_license", RiskLevel.high),
    ("bank account", "bank_account", RiskLevel.critical),
    ("routing number", "bank_routing", RiskLevel.critical),
    ("credit card", "credit_card_mention", RiskLevel.high),
    ("medical record", "medical", RiskLevel.high),
    ("health record", "medical", RiskLevel.high),
    ("salary", "salary", RiskLevel.high),
    ("compensation", "salary", RiskLevel.medium),
    ("home address", "address", RiskLevel.high),
    ("personal information", "pii_general", RiskLevel.medium),
    ("employee record", "employee_data", RiskLevel.high),
    ("customer data", "customer_data", RiskLevel.high),
    ("patient data", "patient_data", RiskLevel.critical),
]


def detect_pii(text: str) -> list[Detection]:
    detections: list[Detection] = []

    # Regex pattern matches
    for pattern, subtype, severity in [
        (SSN_PATTERN, "ssn", RiskLevel.critical),
        (EMAIL_PATTERN, "email", RiskLevel.medium),
        (PHONE_PATTERN, "phone", RiskLevel.medium),
        (CC_PATTERN, "credit_card", RiskLevel.high),
        (NAME_ID_PATTERN, "named_person", RiskLevel.medium),
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

    # Keyword-based detection
    lowered = text.lower()
    for keyword, subtype, severity in PII_KEYWORDS:
        idx = lowered.find(keyword)
        if idx >= 0:
            detections.append(
                Detection(
                    type=DetectionType.pii,
                    subtype=subtype,
                    severity=severity,
                    detail=f"Prompt mentions '{keyword}' — potential PII exposure.",
                    span=(idx, idx + len(keyword)),
                    confidence=0.88,
                    layer=DetectionLayer.l1,
                )
            )

    return detections
