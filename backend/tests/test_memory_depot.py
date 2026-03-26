from fastapi.testclient import TestClient

from main import app


def test_employee_memory_endpoints() -> None:
    with TestClient(app) as client:
        analyze = client.post(
            "/api/analyze",
            json={"employee_id": 1, "prompt_text": "Summarize this task with clear bullets", "target_tool": "chat.openai.com"},
        )
        assert analyze.status_code == 200

        memory = client.get("/api/employees/1/memory")
        assert memory.status_code == 200
        assert "interactions_30d" in memory.json()

        events = client.get("/api/employees/1/memory/events?limit=10")
        assert events.status_code == 200
        assert isinstance(events.json(), list)


def test_agent_memory_and_attribution() -> None:
    with TestClient(app) as client:
        run = client.post(
            "/api/agents/runs",
            json={
                "agent_id": 1,
                "task_type": "triage",
                "cost_usd": 0.25,
                "success": True,
                "latency_ms": 700,
                "quality_score": 0.91,
                "value_score": 0.8,
            },
        )
        assert run.status_code == 200
        run_id = run.json()["id"]

        attribution = client.post(
            "/api/agents/attributions",
            json={
                "agent_id": 1,
                "run_id": run_id,
                "output_ref": f"prompt:{run_id}",
                "revenue_impact_usd": 120.0,
                "cost_saved_usd": 40.0,
                "quality_outcome_score": 0.9,
            },
        )
        assert attribution.status_code == 200

        memory = client.get("/api/agents/1/memory")
        assert memory.status_code == 200
        body = memory.json()
        assert body["net_value_30d_usd"] >= 0
