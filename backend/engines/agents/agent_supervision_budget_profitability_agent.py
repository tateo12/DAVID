from typing import Any

from database import create_alert, fetch_one, fetch_rows
from engines.agents.contracts import BudgetProfitabilityResult
from models import AnalyzeRequest, Detection, RiskLevel


class AgentSupervisionBudgetProfitabilityAgent:
    """Supervises a company's deployed AI agents (Copilot, ChatGPT bots,
    custom agents, etc.) -- NOT Sentinel's own internal sub-agents.

    Responsibilities:
    - Budget tracking and overrun detection per external agent
    - Profitability review (revenue impact vs spend)
    - Security risk auditing of agent actions (anomalous cost, failure
      spikes, suspicious task types, quality drops)
    """

    name = "AgentSupervisionBudgetProfitabilityAgent"

    SUSPICIOUS_TASK_KEYWORDS = [
        "exfiltrate", "export_all", "bulk_download", "delete_all",
        "override_policy", "bypass", "disable_logging", "escalate_privilege",
    ]
    FAILURE_RATE_THRESHOLD = 0.40
    COST_SPIKE_MULTIPLIER = 3.0
    QUALITY_DROP_THRESHOLD = 0.50

    def _audit_agent_security(self) -> tuple[list[dict[str, Any]], list[str]]:
        """Scan all company agents for security-relevant anomalies."""
        security_flags: list[dict[str, Any]] = []
        agents_at_risk: list[str] = []

        agents = fetch_rows(
            "SELECT id, name, budget_usd, spend_usd, quality_score, success_rate FROM agent_budgets ORDER BY id"
        )
        for agent in agents:
            agent_name = agent["name"]
            agent_id = agent["id"]
            budget = float(agent["budget_usd"])
            spend = float(agent["spend_usd"])
            flagged = False

            if budget > 0 and spend > budget:
                security_flags.append({
                    "agent": agent_name,
                    "flag": "budget_overrun",
                    "severity": "high",
                    "detail": f"Spend ${spend:.2f} exceeds budget ${budget:.2f}",
                })
                flagged = True

            recent_stats = fetch_one(
                """
                SELECT
                    COUNT(*) AS run_count,
                    COALESCE(AVG(cost_usd), 0) AS avg_cost,
                    COALESCE(MAX(cost_usd), 0) AS max_cost,
                    COALESCE(AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END), 1.0) AS success_rate_7d,
                    COALESCE(AVG(quality_score), 1.0) AS avg_quality_7d
                FROM agent_runs
                WHERE agent_id = ? AND created_at >= datetime('now', '-7 day')
                """,
                (agent_id,),
            )
            run_count = int(recent_stats["run_count"] or 0)
            if run_count > 0:
                failure_rate = 1.0 - float(recent_stats["success_rate_7d"] or 1.0)
                if failure_rate >= self.FAILURE_RATE_THRESHOLD:
                    security_flags.append({
                        "agent": agent_name,
                        "flag": "high_failure_rate",
                        "severity": "medium",
                        "detail": f"{failure_rate:.0%} failure rate over 7d ({run_count} runs)",
                    })
                    flagged = True

                avg_quality = float(recent_stats["avg_quality_7d"] or 1.0)
                if avg_quality < self.QUALITY_DROP_THRESHOLD:
                    security_flags.append({
                        "agent": agent_name,
                        "flag": "quality_degradation",
                        "severity": "medium",
                        "detail": f"Average quality score {avg_quality:.2f} below threshold {self.QUALITY_DROP_THRESHOLD}",
                    })
                    flagged = True

                baseline = fetch_one(
                    """
                    SELECT COALESCE(AVG(cost_usd), 0) AS avg_cost_30d
                    FROM agent_runs
                    WHERE agent_id = ? AND created_at >= datetime('now', '-30 day')
                    """,
                    (agent_id,),
                )
                avg_cost_30d = float(baseline["avg_cost_30d"] or 0.0)
                avg_cost_7d = float(recent_stats["avg_cost"] or 0.0)
                if avg_cost_30d > 0 and avg_cost_7d > avg_cost_30d * self.COST_SPIKE_MULTIPLIER:
                    security_flags.append({
                        "agent": agent_name,
                        "flag": "cost_spike",
                        "severity": "high",
                        "detail": f"7d avg cost ${avg_cost_7d:.3f} is {avg_cost_7d / avg_cost_30d:.1f}x the 30d baseline ${avg_cost_30d:.3f}",
                    })
                    flagged = True

            suspicious_runs = fetch_rows(
                """
                SELECT task_type, COUNT(*) AS cnt
                FROM agent_runs
                WHERE agent_id = ? AND created_at >= datetime('now', '-7 day')
                GROUP BY task_type
                """,
                (agent_id,),
            )
            for row in suspicious_runs:
                task = str(row["task_type"]).lower()
                for keyword in self.SUSPICIOUS_TASK_KEYWORDS:
                    if keyword in task:
                        security_flags.append({
                            "agent": agent_name,
                            "flag": "suspicious_task_type",
                            "severity": "critical",
                            "detail": f"Task type '{row['task_type']}' matches suspicious pattern '{keyword}' ({row['cnt']} runs)",
                        })
                        flagged = True
                        break

            if flagged:
                agents_at_risk.append(agent_name)

        for flag in security_flags:
            if flag["severity"] in {"high", "critical"}:
                create_alert(
                    "agent_security_risk",
                    RiskLevel.high if flag["severity"] == "high" else RiskLevel.critical,
                    f"[{flag['agent']}] {flag['flag']}: {flag['detail']}",
                )

        return security_flags, agents_at_risk

    def _budget_profitability_review(self) -> dict[str, Any]:
        """Aggregate budget and profitability metrics across all company agents."""
        budget_row = fetch_one(
            """
            SELECT
                COALESCE(SUM(budget_usd), 0.0) AS total_budget,
                COALESCE(SUM(spend_usd), 0.0) AS total_spend
            FROM agent_budgets
            """
        )
        profitability_row = fetch_one(
            """
            SELECT
                COALESCE(SUM(revenue_impact_usd), 0.0) AS revenue_impact,
                COALESCE(SUM(cost_saved_usd), 0.0) AS cost_saved
            FROM agent_output_attributions
            WHERE created_at >= datetime('now', '-30 day')
            """
        )
        top_agents = fetch_rows(
            """
            SELECT name, budget_usd, spend_usd, quality_score, success_rate
            FROM agent_budgets
            ORDER BY success_rate DESC, quality_score DESC
            LIMIT 5
            """
        )
        total_budget = float(budget_row["total_budget"] or 0.0)
        total_spend = float(budget_row["total_spend"] or 0.0)
        revenue_impact = float(profitability_row["revenue_impact"] or 0.0)
        cost_saved = float(profitability_row["cost_saved"] or 0.0)
        net_value = revenue_impact + cost_saved - total_spend
        profitability_index = (revenue_impact + cost_saved) / total_spend if total_spend > 0 else 0.0

        return {
            "total_budget_usd": round(total_budget, 4),
            "total_spend_usd": round(total_spend, 4),
            "remaining_budget_usd": round(max(total_budget - total_spend, 0.0), 4),
            "revenue_impact_30d_usd": round(revenue_impact, 4),
            "cost_saved_30d_usd": round(cost_saved, 4),
            "net_value_30d_usd": round(net_value, 4),
            "profitability_index": round(profitability_index, 4),
            "top_agents": [
                {
                    "name": row["name"],
                    "budget_usd": float(row["budget_usd"]),
                    "spend_usd": float(row["spend_usd"]),
                    "quality_score": float(row["quality_score"]),
                    "success_rate": float(row["success_rate"]),
                }
                for row in top_agents
            ],
        }

    def run(self, payload: AnalyzeRequest, detections: list[Detection]) -> BudgetProfitabilityResult:
        security_flags, agents_at_risk = self._audit_agent_security()
        review = self._budget_profitability_review()
        review["employee_id"] = payload.employee_id
        review["signal_detection_count"] = len(detections)
        review["agent_security_flags"] = len(security_flags)
        review["agents_at_risk"] = agents_at_risk

        return BudgetProfitabilityResult(
            estimated_cost_usd=0.0,
            review=review,
            security_flags=security_flags,
            agents_at_risk=agents_at_risk,
        )
