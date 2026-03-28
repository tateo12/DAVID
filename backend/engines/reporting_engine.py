from datetime import datetime, timedelta, timezone

from database import fetch_one, fetch_rows
from json_utils import loads_json
from models import (
    DashboardMetrics,
    MetricSnapshot,
    RiskDistributionSlice,
    ThreatTrendPoint,
    WeeklyReportResponse,
)


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


def _pct_delta(cur: int, prev: int) -> float | None:
    if prev == 0 and cur == 0:
        return 0.0
    if prev == 0:
        return None
    return round((cur - prev) / prev * 100.0, 1)


def _pct_delta_float(cur: float, prev: float) -> float | None:
    if prev == 0.0 and cur == 0.0:
        return 0.0
    if prev == 0.0:
        return None
    return round((cur - prev) / prev * 100.0, 1)


def _prompt_window_row(where_clause: str) -> dict:
    row = fetch_one(
        f"""
        SELECT
            COUNT(*) AS prompts_analyzed,
            COALESCE(SUM(CASE WHEN action = 'block' THEN 1 ELSE 0 END), 0) AS threats_blocked,
            COALESCE(SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END), 0) AS high_risk_count,
            COALESCE(SUM(CASE WHEN estimated_cost_usd > 0 THEN estimated_cost_usd ELSE 0 END), 0) AS total_model_cost,
            COUNT(DISTINCT employee_id) AS active_employees
        FROM prompts
        WHERE {where_clause}
        """
    )
    return dict(row) if row else {}


def _saved_usd(high_risk: int, model_cost: float) -> float:
    return max(0.0, round((high_risk * 5.0) - model_cost, 2))


def build_dashboard_metrics() -> DashboardMetrics:
    """Rolling 7-day KPIs vs prior 7 days + chart series for the web dashboard."""
    cur = _prompt_window_row("created_at >= datetime('now', '-7 day')")
    prev = _prompt_window_row(
        "created_at >= datetime('now', '-14 day') AND created_at < datetime('now', '-7 day')"
    )

    cur_hr = int(cur.get("high_risk_count") or 0)
    cur_cost = float(cur.get("total_model_cost") or 0.0)
    prev_hr = int(prev.get("high_risk_count") or 0)
    prev_cost = float(prev.get("total_model_cost") or 0.0)

    saved_cur = _saved_usd(cur_hr, cur_cost)
    saved_prev = _saved_usd(prev_hr, prev_cost)

    sh_cur = fetch_one(
        "SELECT COUNT(*) AS c FROM shadow_ai_events WHERE created_at >= datetime('now', '-7 day')"
    )
    sh_prev = fetch_one(
        """
        SELECT COUNT(*) AS c FROM shadow_ai_events
        WHERE created_at >= datetime('now', '-14 day') AND created_at < datetime('now', '-7 day')
        """
    )
    shadow_cur = int(sh_cur["c"] or 0) if sh_cur else 0
    shadow_prev = int(sh_prev["c"] or 0) if sh_prev else 0

    threat_trend = _dashboard_threat_series()
    risk_dist = _dashboard_risk_distribution()

    return DashboardMetrics(
        threats_blocked=int(cur.get("threats_blocked") or 0),
        prompts_analyzed=int(cur.get("prompts_analyzed") or 0),
        active_employees=int(cur.get("active_employees") or 0),
        shadow_ai_events=shadow_cur,
        estimated_cost_saved_usd=saved_cur,
        threats_blocked_trend_pct=_pct_delta(int(cur.get("threats_blocked") or 0), int(prev.get("threats_blocked") or 0)),
        cost_saved_trend_pct=_pct_delta_float(saved_cur, saved_prev),
        shadow_ai_trend_pct=_pct_delta(shadow_cur, shadow_prev),
        active_employees_trend_pct=_pct_delta(
            int(cur.get("active_employees") or 0),
            int(prev.get("active_employees") or 0),
        ),
        threat_trend=threat_trend,
        risk_distribution=risk_dist,
    )


def _dashboard_threat_series() -> list[ThreatTrendPoint]:
    rows = fetch_rows(
        """
        SELECT date(created_at) AS d,
               SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS threats,
               SUM(CASE WHEN action = 'block' THEN 1 ELSE 0 END) AS blocked
        FROM prompts
        WHERE created_at >= datetime('now', '-7 day')
        GROUP BY date(created_at)
        """
    )
    by_date = {str(r["d"]): (int(r["threats"] or 0), int(r["blocked"] or 0)) for r in rows}
    today = datetime.now(timezone.utc).date()
    out: list[ThreatTrendPoint] = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        ds = d.isoformat()
        t, b = by_date.get(ds, (0, 0))
        label = f"{d.month}/{d.day}"
        out.append(ThreatTrendPoint(day=label, threats=t, blocked=b))
    return out


def _dashboard_risk_distribution() -> list[RiskDistributionSlice]:
    rows = fetch_rows(
        """
        SELECT risk_level, COUNT(*) AS c
        FROM prompts
        WHERE created_at >= datetime('now', '-30 day')
        GROUP BY risk_level
        """
    )
    order = ["low", "medium", "high", "critical"]
    counts = {str(r["risk_level"]): int(r["c"] or 0) for r in rows}
    return [RiskDistributionSlice(level=lv, count=counts.get(lv, 0)) for lv in order]


def _weekly_threat_trend() -> list[dict]:
    rows = fetch_rows(
        """
        SELECT date(created_at) AS d,
               SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS threats,
               SUM(CASE WHEN risk_level IN ('low', 'medium') THEN 1 ELSE 0 END) AS safe_count
        FROM prompts
        WHERE created_at >= datetime('now', '-7 day')
        GROUP BY date(created_at)
        ORDER BY d ASC
        """
    )
    return [
        {
            "date": r["d"],
            "threats": int(r["threats"] or 0),
            "safe": int(r["safe_count"] or 0),
        }
        for r in rows
    ]


def _top_risk_employees() -> list[dict]:
    rows = fetch_rows(
        """
        SELECT e.name AS employee, e.department,
               COALESCE(SUM(CASE WHEN p.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END), 0) AS flagged_prompts,
               COALESCE(e.risk_score, 0) AS risk_score
        FROM employees e
        LEFT JOIN prompts p ON p.employee_id = e.id
        GROUP BY e.id
        HAVING flagged_prompts > 0 OR e.risk_score > 0.15
        ORDER BY flagged_prompts DESC, e.risk_score DESC
        LIMIT 8
        """
    )
    out: list[dict] = []
    for r in rows:
        rs = float(r["risk_score"] or 0.0)
        out.append(
            {
                "employee": r["employee"],
                "department": r["department"],
                "risk_score": round(rs * 100),
                "flagged_prompts": int(r["flagged_prompts"] or 0),
            }
        )
    return out


def latest_weekly_report() -> WeeklyReportResponse:
    row = fetch_one("SELECT week_start, week_end, summary, kpis_json FROM weekly_reports ORDER BY id DESC LIMIT 1")
    threat_trend = _weekly_threat_trend()
    top_risks = _top_risk_employees()
    if not row:
        return WeeklyReportResponse(
            week_start="",
            week_end="",
            summary="No report generated.",
            kpis={},
            threat_trend=threat_trend,
            top_risks=top_risks,
        )
    return WeeklyReportResponse(
        week_start=row["week_start"],
        week_end=row["week_end"],
        summary=row["summary"],
        kpis=loads_json(row["kpis_json"], {}),
        threat_trend=threat_trend,
        top_risks=top_risks,
    )


def list_shadow_ai() -> list[dict]:
    rows = fetch_rows(
        "SELECT id, employee_id, tool_domain, risk_level, created_at FROM shadow_ai_events ORDER BY id DESC LIMIT 100"
    )
    return [dict(row) for row in rows]
