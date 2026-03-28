from fastapi.testclient import TestClient

from main import app


def test_policy_assistant_presets_public() -> None:
    with TestClient(app) as client:
        r = client.get("/api/policies/assistant/presets")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert "id" in data[0]
        assert "label" in data[0]


def test_policy_assistant_chat_requires_manager() -> None:
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"username": "test_employee", "password": "testpass"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        r = client.post(
            "/api/policies/assistant/chat",
            json={
                "messages": [{"role": "user", "content": "help"}],
                "selected_presets": ["forbid_confidential_language"],
                "draft_rule": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403


def test_policy_assistant_chat_manager() -> None:
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"username": "test_manager", "password": "testpass"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        r = client.post(
            "/api/policies/assistant/chat",
            json={
                "messages": [{"role": "user", "content": "Apply my selected policy building blocks."}],
                "selected_presets": ["forbid_confidential_language", "block_unknown_ai"],
                "draft_rule": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "message" in body
        assert "rule_json" in body
        assert isinstance(body["rule_json"], dict)
        assert "forbidden_keywords" in body["rule_json"]
