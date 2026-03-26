from fastapi.testclient import TestClient

from main import app


def test_analyze_contract() -> None:
    with TestClient(app) as client:
        payload = {
            "employee_id": 1,
            "prompt_text": "Please process SSN 123-45-6789",
            "target_tool": "chat.openai.com",
            "metadata": {"source": "unit-test"},
        }
        response = client.post("/api/analyze", json=payload)
        assert response.status_code == 200
        body = response.json()
        for key in [
            "prompt_id",
            "risk_level",
            "action",
            "detections",
            "layer_used",
            "confidence",
            "estimated_cost_usd",
            "skill_evaluation",
        ]:
            assert key in body
        assert "skill_class" in body["skill_evaluation"]
