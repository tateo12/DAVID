from urllib.parse import urlparse

from models import Detection, DetectionLayer, DetectionType, RiskLevel


UNAPPROVED_DOMAINS = {
    "unknown-ai.example",
    "myfreegpt.net",
    "shadowchat.ai",
}


def _normalize_tool_domain(target_tool: str | None) -> str | None:
    if not target_tool:
        return None
    candidate = target_tool.strip().lower()
    if "://" in candidate:
        parsed = urlparse(candidate)
        return parsed.netloc or None
    return candidate


def detect_shadow_ai(target_tool: str | None) -> tuple[list[Detection], str | None]:
    domain = _normalize_tool_domain(target_tool)
    if not domain or domain not in UNAPPROVED_DOMAINS:
        return [], domain

    detection = Detection(
        type=DetectionType.shadow_ai,
        subtype="unauthorized_tool",
        severity=RiskLevel.high,
        detail=f"Detected unapproved AI tool domain: {domain}",
        span=(0, 0),
        confidence=0.95,
        layer=DetectionLayer.l1,
    )
    return [detection], domain
