"""Classify L1 regex/rule hits so only blatant signals drive risk before LLM review.

Soft signals (e.g. bare email, keyword-only policy hints) are kept for context but do
not alone justify block/redact/quarantine — L2/L3 and the skill agent provide reasoning.
"""

from __future__ import annotations

from models import Detection, DetectionType, RiskLevel


# Keyword / weak-pattern L1 hits — often false positives in real prompts.
_SOFT_PII_SUBTYPES = frozenset(
    {
        "email",
        "phone",
        "named_person",
        "pii_general",
        "compensation",
        "address",
    }
)

_SOFT_SECRET_SUBTYPES = frozenset(
    {
        "possible_key",
        "password_mention",
        "api_key_mention",
        "secret_key_mention",
        "token_mention",
        "credentials_mention",
        "connection_string_mention",
        "env_file",
    }
)


def is_blatant_l1_detection(d: Detection) -> bool:
    """True when L1 alone is sufficient to treat the hit as obviously problematic."""
    if d.type == DetectionType.shadow_ai:
        return True
    if d.type == DetectionType.secret:
        return d.subtype not in _SOFT_SECRET_SUBTYPES
    if d.type == DetectionType.pii:
        return d.subtype not in _SOFT_PII_SUBTYPES
    if d.type == DetectionType.policy:
        return d.severity in (RiskLevel.high, RiskLevel.critical)
    return True


def partition_l1_detections(detections: list[Detection]) -> tuple[list[Detection], list[Detection]]:
    blatant: list[Detection] = []
    soft: list[Detection] = []
    for d in detections:
        (blatant if is_blatant_l1_detection(d) else soft).append(d)
    return blatant, soft
