from fastapi.testclient import TestClient

from main import app


def test_scout_telemetry_and_chat() -> None:
    with TestClient(app) as client:
        tel = client.get("/api/scout/telemetry")
        assert tel.status_code == 200
        body = tel.json()
        assert "total_prompts" in body
        assert "digest" in body
        assert isinstance(body["digest"], str)
        assert "llm_available" in body

        chat = client.post(
            "/api/scout/chat",
            json={"messages": [{"role": "user", "content": "help"}]},
        )
        assert chat.status_code == 200
        msg = chat.json()
        assert "message" in msg
        assert len(msg["message"]) > 10
        assert "used_llm" in msg
