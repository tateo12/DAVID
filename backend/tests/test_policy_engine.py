from engines.policy_engine import policy_enforcement
from models import Detection, DetectionLayer, DetectionType, RiskLevel


def test_policy_role_code_restriction() -> None:
    existing = [
        Detection(
            type=DetectionType.policy,
            subtype="seed",
            severity=RiskLevel.low,
            detail="seed",
            span=(0, 0),
            confidence=1.0,
            layer=DetectionLayer.l1,
        )
    ]
    out = policy_enforcement("sales", "```print('hello')```", existing)
    assert len(out) >= 2
    assert any(d.subtype == "role_code_restriction" for d in out)
