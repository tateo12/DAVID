from fastapi.testclient import TestClient

from main import app
from tests.conftest import EMPLOYEE_TOKEN, MANAGER_TOKEN

_EMP = {"Authorization": f"Bearer {EMPLOYEE_TOKEN}"}
_MGR = {"Authorization": f"Bearer {MANAGER_TOKEN}"}


def test_extension_capture_employee() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/api/extension/capture",
            json={
                "prompt_text": "Please summarize customer SSN 123-45-6789 for notes",
                "target_tool": "chat.openai.com",
            },
            headers=_EMP,
        )
        assert r.status_code == 200
        body = r.json()
        assert "prompt_id" in body
        assert "risk_level" in body


def test_manager_requires_employee_id() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/api/extension/capture",
            json={"prompt_text": "Audit sample"},
            headers=_MGR,
        )
        assert r.status_code == 400


def test_capture_turn_endpoint() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/api/extension/capture-turn",
            json={
                "prompt_text": "Summarize this ticket for jane@company.com",
                "ai_output_text": "The ticket references jane@company.com and needs a refund.",
                "target_tool": "chat.openai.com",
                "conversation_id": "conv-1",
                "turn_id": "turn-1",
            },
            headers=_EMP,
        )
        assert r.status_code == 200
        body = r.json()
        assert "prompt_analysis" in body
        assert "output_analysis" in body


def test_extension_capture_requires_confirmation_for_risky_attachment() -> None:
    with TestClient(app) as client:
        initial = client.post(
            "/api/extension/capture",
            json={
                "prompt_text": "Summarize this document.",
                "target_tool": "chat.openai.com",
                "attachments": [
                    {
                        "filename": "customer_notes.txt",
                        "mime_type": "text/plain",
                        "size_bytes": 200,
                        "extracted_text": "Customer SSN 123-45-6789 appears in the file",
                        "source": "file_input",
                    }
                ],
            },
            headers=_EMP,
        )
        assert initial.status_code == 200
        body = initial.json()
        assert body["requires_confirmation"] is True
        assert body["warning_context_id"]
        assert len(body["warning_reasons"]) > 0

        confirmed = client.post(
            "/api/extension/capture",
            json={
                "prompt_text": "Summarize this document.",
                "target_tool": "chat.openai.com",
                "warning_confirmed": True,
                "warning_context_id": body["warning_context_id"],
                "attachments": [
                    {
                        "filename": "customer_notes.txt",
                        "mime_type": "text/plain",
                        "size_bytes": 200,
                        "extracted_text": "Customer SSN 123-45-6789 appears in the file",
                        "source": "file_input",
                    }
                ],
            },
            headers=_EMP,
        )
        assert confirmed.status_code == 200
        assert confirmed.json()["requires_confirmation"] is False


def test_extension_capture_rejects_oversized_attachment() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/api/extension/capture",
            json={
                "prompt_text": "Please help summarize.",
                "target_tool": "chat.openai.com",
                "attachments": [
                    {
                        "filename": "big.txt",
                        "mime_type": "text/plain",
                        "size_bytes": 6000000,
                        "extracted_text": "Too big",
                        "source": "file_input",
                    }
                ],
            },
            headers=_EMP,
        )
        assert r.status_code == 422
