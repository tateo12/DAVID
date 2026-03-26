from detectors.pii_detector import detect_pii
from detectors.secrets_detector import detect_secrets
from detectors.shadow_ai_detector import detect_shadow_ai


def test_detect_pii_and_secrets() -> None:
    text = "Employee email a@b.com SSN 123-45-6789 and key sk-12345678901234567890"
    pii = detect_pii(text)
    sec = detect_secrets(text)
    assert any(d.subtype == "ssn" for d in pii)
    assert any(d.subtype == "email" for d in pii)
    assert any(d.subtype == "api_key" for d in sec)


def test_shadow_ai_detect() -> None:
    detections, domain = detect_shadow_ai("unknown-ai.example")
    assert domain == "unknown-ai.example"
    assert len(detections) == 1
