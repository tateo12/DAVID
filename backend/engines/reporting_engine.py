from datetime import datetime, timedelta, timezone
from typing import Any

from database import fetch_one, fetch_rows
from json_utils import loads_json
from models import (
    DashboardMetrics,
    MetricSnapshot,
    RiskDistributionSlice,
    ThreatTrendPoint,
    WeeklyReportResponse,
)


def build_metrics(org_id: int = 1) -> MetricSnapshot:
    totals = fetch_one(
        """
        SELECT
            COUNT(*) AS prompts_analyzed,
            SUM(CASE WHEN action = 'block' THEN 1 ELSE 0 END) AS threats_blocked
        FROM prompts p
        JOIN employees e ON e.id = p.employee_id AND e.org_id = ?
        """,
        (org_id,),
    )
    active = fetch_one("SELECT COUNT(*) AS c FROM employees WHERE org_id = ?", (org_id,))
    shadow = fetch_one(
        "SELECT COUNT(*) AS c FROM shadow_ai_events s JOIN employees e ON e.id = s.employee_id AND e.org_id = ?",
        (org_id,),
    )
    prompts_analyzed = int(totals["prompts_analyzed"] or 0)
    threats_blocked = int(totals["threats_blocked"] or 0)
    return MetricSnapshot(
        threats_blocked=threats_blocked,
        prompts_analyzed=prompts_analyzed,
        active_employees=int(active["c"] or 0),
        shadow_ai_events=int(shadow["c"] or 0),
    )


def _pct_delta(cur: int, prev: int) -> float | None:
    if prev == 0 and cur == 0:
        return 0.0
    if prev == 0:
        return None
    return round((cur - prev) / prev * 100.0, 1)


def _emp_filter_sql(employee_id: int | None) -> str:
    if employee_id is None:
        return ""
    return f" AND p.employee_id = {int(employee_id)}"


def _org_filter_sql(org_id: int | None) -> str:
    if org_id is None:
        return ""
    return f" AND e.org_id = {int(org_id)}"


def _prompt_window_row(where_clause: str, employee_id: int | None = None, org_id: int | None = None) -> dict:
    ef = _emp_filter_sql(employee_id)
    of = _org_filter_sql(org_id)
    row = fetch_one(
        f"""
        SELECT
            COUNT(*) AS prompts_analyzed,
            COALESCE(SUM(CASE WHEN p.action = 'block' THEN 1 ELSE 0 END), 0) AS threats_blocked,
            COUNT(DISTINCT p.employee_id) AS active_employees
        FROM prompts p
        JOIN employees e ON e.id = p.employee_id
        WHERE {where_clause}{ef}{of}
        """
    )
    return dict(row) if row else {}


def empty_employee_dashboard_metrics() -> DashboardMetrics:
    """Neutral payload when an employee user has no linked profile yet."""
    today = datetime.now(timezone.utc).date()
    trend: list[ThreatTrendPoint] = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        trend.append(ThreatTrendPoint(day=f"{d.month}/{d.day}", threats=0, blocked=0))
    order = ["low", "medium", "high", "critical"]
    risk = [RiskDistributionSlice(level=lv, count=0) for lv in order]
    return DashboardMetrics(
        threats_blocked=0,
        prompts_analyzed=0,
        active_employees=0,
        shadow_ai_events=0,
        threats_blocked_trend_pct=0.0,
        shadow_ai_trend_pct=0.0,
        active_employees_trend_pct=0.0,
        threat_trend=trend,
        risk_distribution=risk,
    )


def build_dashboard_metrics(employee_id: int | None = None, org_id: int | None = None) -> DashboardMetrics:
    """Rolling 7-day KPIs vs prior 7 days + chart series for the web dashboard.
    When employee_id is set, all series are limited to that employee (employee session)."""
    cur = _prompt_window_row("p.created_at >= datetime('now', '-7 day')", employee_id, org_id)
    prev = _prompt_window_row(
        "p.created_at >= datetime('now', '-14 day') AND p.created_at < datetime('now', '-7 day')",
        employee_id,
        org_id,
    )

    ef = _emp_filter_sql(employee_id)
    of = "" if org_id is None else f" AND e.org_id = {int(org_id)}"
    sh_cur = fetch_one(
        f"SELECT COUNT(*) AS c FROM shadow_ai_events s JOIN employees e ON e.id = s.employee_id WHERE s.created_at >= datetime('now', '-7 day'){ef}{of}"
    )
    sh_prev = fetch_one(
        f"""
        SELECT COUNT(*) AS c FROM shadow_ai_events s JOIN employees e ON e.id = s.employee_id
        WHERE s.created_at >= datetime('now', '-14 day') AND s.created_at < datetime('now', '-7 day'){ef}{of}
        """
    )
    shadow_cur = int(sh_cur["c"] or 0) if sh_cur else 0
    shadow_prev = int(sh_prev["c"] or 0) if sh_prev else 0

    threat_trend = _dashboard_threat_series(org_id)
    risk_dist = _dashboard_risk_distribution(employee_id, org_id)

    return DashboardMetrics(
        threats_blocked=int(cur.get("threats_blocked") or 0),
        prompts_analyzed=int(cur.get("prompts_analyzed") or 0),
        active_employees=int(cur.get("active_employees") or 0),
        shadow_ai_events=shadow_cur,
        threats_blocked_trend_pct=_pct_delta(int(cur.get("threats_blocked") or 0), int(prev.get("threats_blocked") or 0)),
        shadow_ai_trend_pct=_pct_delta(shadow_cur, shadow_prev),
        active_employees_trend_pct=_pct_delta(
            int(cur.get("active_employees") or 0),
            int(prev.get("active_employees") or 0),
        ),
        threat_trend=threat_trend,
        risk_distribution=risk_dist,
    )


def _dashboard_threat_series(org_id: int | None = None) -> list[ThreatTrendPoint]:
    of = "" if org_id is None else f" AND e.org_id = {int(org_id)}"
    rows = fetch_rows(
        f"""
        SELECT date(p.created_at) AS d,
               SUM(CASE WHEN p.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS threats,
               SUM(CASE WHEN p.action = 'block' THEN 1 ELSE 0 END) AS blocked
        FROM prompts p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.created_at >= datetime('now', '-7 day'){of}
        GROUP BY date(p.created_at)
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


def _dashboard_risk_distribution(employee_id: int | None = None, org_id: int | None = None) -> list[RiskDistributionSlice]:
    ef = _emp_filter_sql(employee_id)
    of = _org_filter_sql(org_id)
    rows = fetch_rows(
        f"""
        SELECT p.risk_level, COUNT(*) AS c
        FROM prompts p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.created_at >= datetime('now', '-30 day'){ef}{of}
        GROUP BY p.risk_level
        """
    )
    order = ["low", "medium", "high", "critical"]
    counts = {str(r["risk_level"]): int(r["c"] or 0) for r in rows}
    return [RiskDistributionSlice(level=lv, count=counts.get(lv, 0)) for lv in order]


def _weekly_threat_trend(org_id: int | None = None) -> list[dict]:
    of = "" if org_id is None else f" AND e.org_id = {int(org_id)}"
    rows = fetch_rows(
        f"""
        SELECT date(p.created_at) AS d,
               SUM(CASE WHEN p.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS threats,
               SUM(CASE WHEN p.risk_level IN ('low', 'medium') THEN 1 ELSE 0 END) AS safe_count
        FROM prompts p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.created_at >= datetime('now', '-7 day'){of}
        GROUP BY date(p.created_at)
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


def _weekly_live_kpis(org_id: int | None = None) -> dict[str, Any]:
    """Rolling 7-day KPIs from prompts + employee risk scores (always fresh for the API)."""
    of = "" if org_id is None else f" AND e.org_id = {int(org_id)}"
    row = fetch_one(
        f"""
        SELECT
            COUNT(*) AS total_prompts,
            COALESCE(SUM(CASE WHEN p.action = 'block' THEN 1 ELSE 0 END), 0) AS threats_blocked,
            COUNT(DISTINCT CASE
                WHEN p.risk_level IN ('high', 'critical') THEN p.employee_id
            END) AS high_risk_users
        FROM prompts p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.created_at >= datetime('now', '-7 day'){of}
        """
    )
    avg_row = fetch_one(
        f"""
        SELECT COALESCE(AVG(e.risk_score), 0) * 100 AS avg_risk_score
        FROM employees e
        WHERE e.org_id IS NOT NULL{of}
        AND EXISTS (
            SELECT 1 FROM prompts p
            WHERE p.employee_id = e.id AND p.created_at >= datetime('now', '-7 day')
        )
        """
    )
    total_prompts = int(row["total_prompts"] or 0) if row else 0
    threats_blocked = int(row["threats_blocked"] or 0) if row else 0
    high_risk_users = int(row["high_risk_users"] or 0) if row else 0
    avg_risk = float(avg_row["avg_risk_score"] or 0.0) if avg_row else 0.0
    return {
        "total_prompts": total_prompts,
        "prompts_7d": total_prompts,
        "threats_blocked": threats_blocked,
        "high_risk_users": high_risk_users,
        "avg_risk_score": round(avg_risk, 1),
    }


def _top_risk_employees(org_id: int | None = None) -> list[dict]:
    of = "" if org_id is None else f" AND e.org_id = {int(org_id)}"
    rows = fetch_rows(
        f"""
        SELECT e.name AS employee, e.department,
               COALESCE(SUM(CASE WHEN p.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END), 0) AS flagged_prompts,
               COALESCE(e.risk_score, 0) AS risk_score
        FROM employees e
        LEFT JOIN prompts p ON p.employee_id = e.id
        WHERE 1=1{of}
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


def latest_weekly_report(org_id: int | None = None) -> WeeklyReportResponse:
    threat_trend = _weekly_threat_trend(org_id)
    top_risks = _top_risk_employees(org_id)
    live = _weekly_live_kpis(org_id)
    of = "" if org_id is None else f" WHERE org_id = {int(org_id)}"
    row = fetch_one(f"SELECT week_start, week_end, summary, kpis_json FROM weekly_reports{of} ORDER BY id DESC LIMIT 1")
    if not row:
        return WeeklyReportResponse(
            week_start="",
            week_end="",
            summary="No manager weekly report row yet. KPIs below reflect prompt activity over the last 7 days.",
            kpis=live,
            threat_trend=threat_trend,
            top_risks=top_risks,
        )
    stored = loads_json(row["kpis_json"], {})
    merged = {**stored, **live}
    return WeeklyReportResponse(
        week_start=row["week_start"],
        week_end=row["week_end"],
        summary=row["summary"],
        kpis=merged,
        threat_trend=threat_trend,
        top_risks=top_risks,
    )


def list_shadow_ai(employee_id: int | None = None, org_id: int | None = None) -> list[dict]:
    ef = "" if employee_id is None else f" AND s.employee_id = {int(employee_id)}"
    of = "" if org_id is None else f" AND e.org_id = {int(org_id)}"
    rows = fetch_rows(
        f"SELECT s.id, s.employee_id, s.tool_domain, s.risk_level, s.created_at FROM shadow_ai_events s JOIN employees e ON e.id = s.employee_id WHERE 1=1{ef}{of} ORDER BY s.id DESC LIMIT 100"
    )
    return [dict(row) for row in rows]
