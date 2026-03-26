from models import Detection, DetectionLayer, DetectionType, RiskLevel


# Terms that indicate policy violations
FORBIDDEN_TERMS = [
    # Confidentiality
    ("confidential", RiskLevel.high),
    ("internal-only", RiskLevel.high),
    ("internal only", RiskLevel.high),
    ("do not share", RiskLevel.high),
    ("nda", RiskLevel.high),
    ("trade secret", RiskLevel.critical),
    ("proprietary", RiskLevel.high),
    ("classified", RiskLevel.critical),
    # Data handling violations
    ("customer list", RiskLevel.high),
    ("private roadmap", RiskLevel.high),
    ("product roadmap", RiskLevel.medium),
    ("unreleased", RiskLevel.medium),
    ("pre-release", RiskLevel.medium),
    # Database/system access
    ("search the database", RiskLevel.high),
    ("query the database", RiskLevel.high),
    ("database dump", RiskLevel.critical),
    ("export all", RiskLevel.high),
    ("download all", RiskLevel.high),
    ("extract all", RiskLevel.high),
    ("bulk export", RiskLevel.high),
    ("select * from", RiskLevel.critical),
    ("drop table", RiskLevel.critical),
    ("delete from", RiskLevel.high),
    ("truncate", RiskLevel.critical),
    # Security bypass
    ("bypass", RiskLevel.high),
    ("workaround for security", RiskLevel.critical),
    ("disable authentication", RiskLevel.critical),
    ("ignore permissions", RiskLevel.critical),
    ("admin access", RiskLevel.high),
    ("root access", RiskLevel.critical),
    ("privilege escalation", RiskLevel.critical),
    # Harmful intent
    ("phishing", RiskLevel.critical),
    ("exploit", RiskLevel.high),
    ("vulnerability", RiskLevel.medium),
    ("injection", RiskLevel.high),
    ("hack", RiskLevel.high),
    ("scrape", RiskLevel.medium),
    ("reverse engineer", RiskLevel.high),
]


def detect_policy_violations(text: str) -> list[Detection]:
    lowered = text.lower()
    detections: list[Detection] = []
    for term, severity in FORBIDDEN_TERMS:
        idx = lowered.find(term)
        if idx >= 0:
            detections.append(
                Detection(
                    type=DetectionType.policy,
                    subtype="policy_violation",
                    severity=severity,
                    detail=f"Policy violation: prompt contains '{term}'",
                    span=(idx, idx + len(term)),
                    confidence=0.85,
                    layer=DetectionLayer.l1,
                )
            )
    return detections
