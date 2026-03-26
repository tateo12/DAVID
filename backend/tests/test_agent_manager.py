from fastapi.testclient import TestClient

from main import app


def test_log_agent_run_and_summary() -> None:
    with TestClient(app) as client:
        run_res = client.post(
            "/api/agents/runs",
            json={
                "agent_id": 1,
                "task_type": "triage",
                "cost_usd": 0.12,
                "success": True,
                "latency_ms": 820,
                "quality_score": 0.9,
                "value_score": 0.85,
                "metadata": {"source": "unit-test"},
            },
        )
        assert run_res.status_code == 200
        assert run_res.json()["agent_id"] == 1

        summary_res = client.get("/api/agents/summary")
        assert summary_res.status_code == 200
        body = summary_res.json()
        assert "agents" in body
        assert "totals" in body
        assert len(body["agents"]) >= 1


def test_rebalance_endpoint() -> None:
    with TestClient(app) as client:
        res = client.post("/api/agents/rebalance")
        assert res.status_code == 200
        assert "changes" in res.json()
