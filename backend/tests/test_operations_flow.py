from fastapi.testclient import TestClient

from main import app
from tests.conftest import MANAGER_TOKEN

_MGR = {"Authorization": f"Bearer {MANAGER_TOKEN}"}


def test_ops_dispatch_and_code_review() -> None:
    with TestClient(app) as client:
        agent_event = client.post(
            "/api/ops/events/agent-action",
            json={
                "agent_id": 1,
                "task_type": "autonomous_triage",
                "cost_usd": 0.2,
                "success": True,
                "latency_ms": 650,
                "quality_score": 0.88,
                "value_score": 0.81,
            },
        )
        assert agent_event.status_code == 200

        daily = client.post("/api/ops/dispatch/daily-coaching", headers=_MGR)
        assert daily.status_code == 200

        weekly = client.post("/api/ops/dispatch/weekly-manager-report", headers=_MGR)
        assert weekly.status_code == 200

        security = client.post("/api/ops/dispatch/security-notices", headers=_MGR)
        assert security.status_code == 200

        review = client.post(
            "/api/ops/code-review/submit",
            json={
                "employee_id": 1,
                "code_text": "const token = 'sk-12345678901234567890';",
                "target_tool": "copilot",
            },
        )
        assert review.status_code == 200
        assert "risk_level" in review.json()

        tick = client.post("/api/ops/tick", headers=_MGR)
        assert tick.status_code == 200
        tick_body = tick.json()
        assert "ran_at" in tick_body
        assert "jobs" in tick_body
        assert len(tick_body["jobs"]) == 4
