import json

from fastapi import APIRouter, HTTPException

from config import get_settings
from database import create_alert, execute, fetch_one, fetch_rows
from models import (
    AgentRebalanceChange,
    AgentRebalanceResponse,
    AgentRecord,
    AgentRunCreateRequest,
    AgentRunRecord,
    AgentSummaryRecord,
    AgentSummaryResponse,
    RiskLevel,
    UpdateAgentBudgetRequest,
)

router = APIRouter(prefix="/agents", tags=["agents"])


def _refresh_agent_rollup(agent_id: int) -> None:
    stats = fetch_one(
        """
        SELECT
            COALESCE(SUM(cost_usd), 0) AS spend_usd,
            COALESCE(AVG(quality_score), 0.8) AS quality_score,
            COALESCE(AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END), 0.8) AS success_rate
        FROM agent_runs
        WHERE agent_id = ? AND created_at >= datetime('now', '-7 day')
        """,
        (agent_id,),
    )
    execute(
        "UPDATE agent_budgets SET spend_usd = ?, quality_score = ?, success_rate = ? WHERE id = ?",
        (
            float(stats["spend_usd"] or 0.0),
            float(stats["quality_score"] or 0.8),
            float(stats["success_rate"] or 0.8),
            agent_id,
        ),
    )


@router.get("", response_model=list[AgentRecord])
def list_agents() -> list[AgentRecord]:
    rows = fetch_rows("SELECT id, name, budget_usd, spend_usd, quality_score, success_rate FROM agent_budgets ORDER BY id")
    return [AgentRecord(**dict(row)) for row in rows]


@router.post("/runs", response_model=AgentRunRecord)
def log_agent_run(payload: AgentRunCreateRequest) -> AgentRunRecord:
    agent = fetch_one("SELECT id, name, budget_usd FROM agent_budgets WHERE id = ?", (payload.agent_id,))
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    run_id = execute(
        """
        INSERT INTO agent_runs (
            agent_id, task_type, cost_usd, success, latency_ms, quality_score, value_score, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            payload.agent_id,
            payload.task_type,
            payload.cost_usd,
            1 if payload.success else 0,
            payload.latency_ms,
            payload.quality_score,
            payload.value_score,
            json.dumps(payload.metadata or {}),
        ),
    )
    _refresh_agent_rollup(payload.agent_id)

    refreshed = fetch_one("SELECT spend_usd, budget_usd FROM agent_budgets WHERE id = ?", (payload.agent_id,))
    if refreshed and float(refreshed["spend_usd"]) > float(refreshed["budget_usd"]):
        create_alert(
            "agent_budget_overrun",
            RiskLevel.high,
            f"Agent {agent['name']} exceeded budget: spend={refreshed['spend_usd']:.2f}, budget={refreshed['budget_usd']:.2f}",
        )

    row = fetch_one(
        """
        SELECT id, agent_id, task_type, cost_usd, success, latency_ms, quality_score, value_score, created_at
        FROM agent_runs
        WHERE id = ?
        """,
        (run_id,),
    )
    return AgentRunRecord(
        id=row["id"],
        agent_id=row["agent_id"],
        task_type=row["task_type"],
        cost_usd=row["cost_usd"],
        success=bool(row["success"]),
        latency_ms=row["latency_ms"],
        quality_score=row["quality_score"],
        value_score=row["value_score"],
        created_at=row["created_at"],
    )


@router.get("/summary", response_model=AgentSummaryResponse)
def agents_summary() -> AgentSummaryResponse:
    rows = fetch_rows(
        """
        SELECT
            ab.id,
            ab.name,
            ab.budget_usd,
            ab.spend_usd,
            COALESCE(COUNT(ar.id), 0) AS runs_7d,
            COALESCE(AVG(CASE WHEN ar.success = 1 THEN 1.0 ELSE 0.0 END), 0.0) AS success_rate_7d,
            COALESCE(AVG(ar.quality_score), 0.0) AS avg_quality_7d,
            COALESCE(AVG(ar.value_score), 0.0) AS avg_value_7d
        FROM agent_budgets ab
        LEFT JOIN agent_runs ar
            ON ar.agent_id = ab.id
            AND ar.created_at >= datetime('now', '-7 day')
        GROUP BY ab.id
        ORDER BY ab.id
        """
    )
    agents: list[AgentSummaryRecord] = []
    total_budget = 0.0
    total_spend = 0.0
    for row in rows:
        budget = float(row["budget_usd"])
        spend = float(row["spend_usd"])
        value = float(row["avg_value_7d"])
        quality = float(row["avg_quality_7d"])
        roi_proxy = 0.0 if spend <= 0 else (value * quality) / spend
        agents.append(
            AgentSummaryRecord(
                id=row["id"],
                name=row["name"],
                budget_usd=budget,
                spend_usd=spend,
                remaining_budget_usd=round(budget - spend, 2),
                success_rate_7d=round(float(row["success_rate_7d"]), 3),
                avg_quality_7d=round(quality, 3),
                avg_value_7d=round(value, 3),
                runs_7d=int(row["runs_7d"]),
                roi_proxy=round(roi_proxy, 4),
            )
        )
        total_budget += budget
        total_spend += spend

    return AgentSummaryResponse(
        agents=agents,
        totals={
            "total_budget_usd": round(total_budget, 2),
            "total_spend_usd": round(total_spend, 2),
            "remaining_budget_usd": round(total_budget - total_spend, 2),
        },
    )


@router.post("/rebalance", response_model=AgentRebalanceResponse)
def rebalance_agent_budgets() -> AgentRebalanceResponse:
    rows = fetch_rows(
        """
        SELECT
            ab.id,
            ab.name,
            ab.budget_usd,
            COALESCE(AVG(ar.quality_score), 0.0) AS avg_quality,
            COALESCE(AVG(ar.value_score), 0.0) AS avg_value,
            COALESCE(AVG(CASE WHEN ar.success = 1 THEN 1.0 ELSE 0.0 END), 0.0) AS success_rate
        FROM agent_budgets ab
        LEFT JOIN agent_runs ar
            ON ar.agent_id = ab.id
            AND ar.created_at >= datetime('now', '-7 day')
        GROUP BY ab.id
        """
    )
    changes: list[AgentRebalanceChange] = []
    for row in rows:
        old_budget = float(row["budget_usd"])
        score = (float(row["avg_quality"]) * 0.4) + (float(row["avg_value"]) * 0.35) + (float(row["success_rate"]) * 0.25)
        if score >= 0.75:
            new_budget = old_budget * 1.1
            reason = "Strong recent quality/value/success performance."
        elif score <= 0.45:
            new_budget = old_budget * 0.9
            reason = "Weak recent performance; reduce spend until quality recovers."
        else:
            continue

        max_budget = get_settings().daily_budget_usd
        bounded_budget = round(min(max(new_budget, 1.0), max_budget), 2)
        if bounded_budget == round(old_budget, 2):
            continue

        execute("UPDATE agent_budgets SET budget_usd = ? WHERE id = ?", (bounded_budget, row["id"]))
        changes.append(
            AgentRebalanceChange(
                agent_id=row["id"],
                old_budget_usd=round(old_budget, 2),
                new_budget_usd=bounded_budget,
                reason=reason,
            )
        )
        create_alert(
            "agent_rebalance",
            RiskLevel.low,
            f"Agent {row['name']} budget changed from {old_budget:.2f} to {bounded_budget:.2f}",
        )

    return AgentRebalanceResponse(changes=changes)


@router.put("/{agent_id}/budget", response_model=AgentRecord)
def update_agent_budget(agent_id: int, payload: UpdateAgentBudgetRequest) -> AgentRecord:
    row = fetch_one("SELECT id, name, spend_usd, quality_score, success_rate FROM agent_budgets WHERE id = ?", (agent_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    execute("UPDATE agent_budgets SET budget_usd = ? WHERE id = ?", (payload.budget_usd, agent_id))
    if payload.budget_usd > get_settings().daily_budget_usd:
        create_alert("spend_limit", RiskLevel.medium, f"Agent {row['name']} budget exceeds daily backend budget.")
    return AgentRecord(
        id=row["id"],
        name=row["name"],
        budget_usd=payload.budget_usd,
        spend_usd=row["spend_usd"],
        quality_score=row["quality_score"],
        success_rate=row["success_rate"],
    )
