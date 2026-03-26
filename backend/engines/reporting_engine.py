import json

from database import fetch_one, fetch_rows
from models import MetricSnapshot, WeeklyReportResponse


def build_metrics() -> MetricSnapshot:
    totals = fetch_one(
        """
        SELECT
            COUNT(*) AS prompts_analyzed,
            SUM(CASE WHEN action = 'block' THEN 1 ELSE 0 END) AS threats_blocked,
            SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS high_risk_count,
            SUM(CASE WHEN estimated_cost_usd > 0 THEN estimated_cost_usd ELSE 0 END) AS total_model_cost
        FROM prompts
        """
    )
    active = fetch_one("SELECT COUNT(*) AS c FROM employees")
    shadow = fetch_one("SELECT COUNT(*) AS c FROM shadow_ai_events")
    prompts_analyzed = int(totals["prompts_analyzed"] or 0)
    threats_blocked = int(totals["threats_blocked"] or 0)
    high_risk = int(totals["high_risk_count"] or 0)
    total_model_cost = float(totals["total_model_cost"] or 0.0)
    estimated_saved = max(0.0, (high_risk * 5.0) - total_model_cost)
    return MetricSnapshot(
        threats_blocked=threats_blocked,
        prompts_analyzed=prompts_analyzed,
        active_employees=int(active["c"] or 0),
        shadow_ai_events=int(shadow["c"] or 0),
        estimated_cost_saved_usd=round(estimated_saved, 2),
    )


def latest_weekly_report() -> WeeklyReportResponse:
    row = fetch_one("SELECT week_start, week_end, summary, kpis_json FROM weekly_reports ORDER BY id DESC LIMIT 1")
    if not row:
        return WeeklyReportResponse(week_start="", week_end="", summary="No report generated.", kpis={})
    return WeeklyReportResponse(
        week_start=row["week_start"],
        week_end=row["week_end"],
        summary=row["summary"],
        kpis=json.loads(row["kpis_json"]),
    )


def list_shadow_ai() -> list[dict]:
    rows = fetch_rows(
        "SELECT id, employee_id, tool_domain, risk_level, created_at FROM shadow_ai_events ORDER BY id DESC LIMIT 100"
    )
    return [dict(row) for row in rows]
