from database import fetch_one, fetch_rows
from engines.agents.contracts import BudgetProfitabilityResult
from models import AnalyzeRequest, Detection


class AgentSupervisionBudgetProfitabilityAgent:
    name = "AgentSupervisionBudgetProfitabilityAgent"

    def run(self, payload: AnalyzeRequest, detections: list[Detection]) -> BudgetProfitabilityResult:
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
            LIMIT 3
            """
        )
        total_budget = float(budget_row["total_budget"] or 0.0)
        total_spend = float(budget_row["total_spend"] or 0.0)
        revenue_impact = float(profitability_row["revenue_impact"] or 0.0)
        cost_saved = float(profitability_row["cost_saved"] or 0.0)
        net_value = revenue_impact + cost_saved - total_spend
        profitability_index = (revenue_impact + cost_saved) / total_spend if total_spend > 0 else 0.0

        review = {
            "employee_id": payload.employee_id,
            "signal_detection_count": len(detections),
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
        # Preserve current behavior and cost profile of /api/analyze.
        return BudgetProfitabilityResult(estimated_cost_usd=0.0, review=review)
