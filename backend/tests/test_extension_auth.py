from fastapi.testclient import TestClient

from main import app


def test_login_and_extension_capture_employee() -> None:
    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "employee1", "password": "demo123"},
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]

        capture_response = client.post(
            "/api/extension/capture",
            json={
                "prompt_text": "Please summarize customer SSN 123-45-6789 for notes",
                "target_tool": "chat.openai.com",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert capture_response.status_code == 200
        body = capture_response.json()
        assert "prompt_id" in body
        assert "risk_level" in body


def test_manager_requires_employee_id() -> None:
    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "manager1", "password": "demo123"},
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]

        capture_response = client.post(
            "/api/extension/capture",
            json={"prompt_text": "Audit sample"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert capture_response.status_code == 400


def test_capture_turn_endpoint() -> None:
    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "employee1", "password": "demo123"},
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]

        turn_response = client.post(
            "/api/extension/capture-turn",
            json={
                "prompt_text": "Summarize this ticket for jane@company.com",
                "ai_output_text": "The ticket references jane@company.com and needs a refund.",
                "target_tool": "chat.openai.com",
                "conversation_id": "conv-1",
                "turn_id": "turn-1",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert turn_response.status_code == 200
        body = turn_response.json()
        assert "prompt_analysis" in body
        assert "output_analysis" in body
