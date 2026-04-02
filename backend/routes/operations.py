import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_ops_manager

from database import execute, fetch_one, fetch_rows, get_conn
from json_utils import loads_json
from engines.orchestrator_factory import get_orchestrator
from models import (
    AgentActionEventRequest,
    AnalyzeRequest,
    AnalyzeResponse,
    CodeReviewSubmitRequest,
    DispatchResult,
    TickJobResult,
    TickResponse,
)

router = APIRouter(prefix="/ops", tags=["operations"])


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _insert_message(
    recipient_type: str,
    recipient_id: int | None,
    message_type: str,
    subject: str,
    body: str,
    related_entity: str | None = None,
) -> None:
    execute(
        """
        INSERT INTO system_messages (recipient_type, recipient_id, message_type, subject, body, related_entity, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (recipient_type, recipient_id, message_type, subject, body, related_entity, _utc_now()),
    )


def _job_due(name: str) -> tuple[bool, str]:
    row = fetch_one("SELECT interval_seconds, last_run_at, enabled FROM system_jobs WHERE name = ?", (name,))
    if not row:
        return False, "missing_job_config"
    if int(row["enabled"]) != 1:
        return False, "disabled"
    last_run_at = row["last_run_at"]
    if not last_run_at:
        return True, "never_ran"
    last = datetime.fromisoformat(last_run_at.replace("Z", "+00:00"))
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - last).total_seconds()
    return elapsed >= int(row["interval_seconds"]), f"elapsed={int(elapsed)}s"


def _mark_job_run(name: str) -> None:
    execute("UPDATE system_jobs SET last_run_at = ? WHERE name = ?", (_utc_now(), name))


@router.post("/events/agent-action", response_model=DispatchResult)
def trigger_agent_assessment(payload: AgentActionEventRequest) -> DispatchResult:
    agent = fetch_one("SELECT id, name FROM agent_budgets WHERE id = ?", (payload.agent_id,))
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    execute(
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
    stats = fetch_one(
        """
        SELECT COALESCE(SUM(cost_usd), 0) AS spend_usd,
               COALESCE(AVG(quality_score), 0.8) AS quality_score,
               COALESCE(AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END), 0.8) AS success_rate
        FROM agent_runs
        WHERE agent_id = ? AND created_at >= datetime('now', '-7 day')
        """,
        (payload.agent_id,),
    )
    execute(
        "UPDATE agent_budgets SET spend_usd = ?, quality_score = ?, success_rate = ? WHERE id = ?",
        (float(stats["spend_usd"]), float(stats["quality_score"]), float(stats["success_rate"]), payload.agent_id),
    )
    return DispatchResult(generated_count=1, message=f"Agent assessment logged for {agent['name']}.")


@router.post("/events/employee-prompt", response_model=AnalyzeResponse)
def trigger_employee_evaluation(payload: AnalyzeRequest) -> AnalyzeResponse:
    return get_orchestrator().run(payload)


@router.post("/dispatch/daily-coaching", response_model=DispatchResult)
def dispatch_daily_coaching() -> DispatchResult:
    rows = fetch_rows(
        """
        SELECT e.id AS employee_id, e.name, esp.ai_skill_score, esp.skill_class, esp.last_improvements_json
        FROM employees e
        INNER JOIN employee_skill_profiles esp ON esp.employee_id = e.id
        WHERE EXISTS (
            SELECT 1 FROM prompts p
            WHERE p.employee_id = e.id AND p.created_at >= datetime('now', '-1 day')
        )
        """
    )
    count = 0
    for row in rows:
        improvements = loads_json(row["last_improvements_json"], [])
        focus = improvements[0] if improvements else "Keep using clear task + context + constraints structure."
        _insert_message(
            recipient_type="employee",
            recipient_id=row["employee_id"],
            message_type="daily_coaching",
            subject=f"Daily AI Coaching for {row['name']}",
            body=(
                f"Current skill class: {row['skill_class']}. "
                f"Skill score: {float(row['ai_skill_score']):.2f}. "
                f"Today's focus: {focus}"
            ),
            related_entity="employee_skill_profiles",
        )
        count += 1
    return DispatchResult(generated_count=count, message="Daily coaching messages generated.")


@router.post("/dispatch/weekly-manager-report", response_model=DispatchResult)
def dispatch_weekly_manager_report(_: dict = Depends(require_ops_manager)) -> DispatchResult:
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=7)).date().isoformat()
    week_end = now.date().isoformat()
    risk = fetch_one(
        """
        SELECT
            COUNT(*) AS prompt_count,
            SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS high_risk_count
        FROM prompts
        WHERE created_at >= datetime('now', '-7 day')
        """
    )
    skill = fetch_one(
        """
        SELECT
            COALESCE(AVG(ai_skill_score), 0.0) AS avg_skill,
            SUM(CASE WHEN ai_skill_score < 0.45 THEN 1 ELSE 0 END) AS low_skill
        FROM employee_skill_profiles
        """
    )
    report_summary = (
        f"Weekly Sentinel report: prompts={int(risk['prompt_count'] or 0)}, "
        f"high_risk={int(risk['high_risk_count'] or 0)}, "
        f"avg_skill={float(skill['avg_skill'] or 0.0):.2f}, "
        f"low_skill_employees={int(skill['low_skill'] or 0)}."
    )
    kpis = {
        "prompts_7d": int(risk["prompt_count"] or 0),
        "high_risk_7d": int(risk["high_risk_count"] or 0),
        "avg_skill_score": float(skill["avg_skill"] or 0.0),
        "low_skill_employees": int(skill["low_skill"] or 0),
    }
    execute(
        "INSERT INTO weekly_reports (week_start, week_end, summary, kpis_json) VALUES (?, ?, ?, ?)",
        (week_start, week_end, report_summary, json.dumps(kpis)),
    )
    _insert_message(
        recipient_type="manager",
        recipient_id=None,
        message_type="weekly_report",
        subject=f"Sentinel Weekly Report ({week_start} to {week_end})",
        body=report_summary,
        related_entity="weekly_reports",
    )
    return DispatchResult(generated_count=1, message="Weekly manager report generated and queued.")


@router.post("/dispatch/weekly-learning", response_model=DispatchResult)
def dispatch_weekly_learning_emails(_: dict = Depends(require_ops_manager)) -> DispatchResult:
    """Generate and send personalized weekly learning emails to all active employees."""
    import logging

    from engines.email_sender import EmailSender
    from engines.learning_engine import build_learning_email_context
    from routes.emails import render_template

    log = logging.getLogger(__name__)
    sender = EmailSender()

    rows = fetch_rows(
        """
        SELECT DISTINCT e.id AS employee_id
        FROM employees e
        INNER JOIN prompts p ON p.employee_id = e.id
        WHERE p.created_at >= datetime('now', '-7 day')
        """
    )
    count = 0
    for row in rows:
        employee_id = row["employee_id"]
        ctx = build_learning_email_context(employee_id)
        if not ctx:
            continue
        try:
            html = render_template("learning.html", ctx)
        except Exception:
            log.exception("weekly learning template failed for employee_id=%s", employee_id)
            continue
        sender.send_weekly_learning(employee_id, html)
        count += 1
    return DispatchResult(generated_count=count, message=f"Weekly learning emails sent to {count} employees.")


@router.post("/dispatch/security-notices", response_model=DispatchResult)
def dispatch_security_notices(_: dict = Depends(require_ops_manager)) -> DispatchResult:
    rows = fetch_rows(
        """
        SELECT id, severity, detail, created_at
        FROM alerts
        WHERE is_active = 1
          AND created_at >= datetime('now', '-1 day')
          AND id NOT IN (SELECT alert_id FROM alert_notifications)
        ORDER BY id DESC
        """
    )
    count = 0
    for row in rows:
        _insert_message(
            recipient_type="manager",
            recipient_id=None,
            message_type="security_notice",
            subject=f"Security event ({row['severity']})",
            body=row["detail"],
            related_entity=f"alert:{row['id']}",
        )
        execute("INSERT OR IGNORE INTO alert_notifications (alert_id, notified_at) VALUES (?, ?)", (row["id"], _utc_now()))
        count += 1
    return DispatchResult(generated_count=count, message="Security notices queued.")


@router.post("/code-review/submit", response_model=AnalyzeResponse)
def review_engineer_code_submit(payload: CodeReviewSubmitRequest) -> AnalyzeResponse:
    employee = fetch_one("SELECT id, role FROM employees WHERE id = ?", (payload.employee_id,))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if employee["role"] != "engineer":
        raise HTTPException(status_code=403, detail="Code submit review is only for engineers")

    return get_orchestrator().run(
        AnalyzeRequest(
            employee_id=payload.employee_id,
            prompt_text=payload.code_text,
            target_tool=payload.target_tool or "code_submit_hook",
            metadata={"event_type": "engineer_code_submit", **(payload.metadata or {})},
        )
    )


@router.post("/reset")
def reset_all_data(_current_user: dict = Depends(require_ops_manager)) -> dict:
    """Wipe all transactional data, keep employees and config."""
    with get_conn() as conn:
        # Order respects FKs when foreign_keys=ON (children before parents).
        for table in [
            "alert_notifications",
            "detections",
            "employee_interaction_memory",
            "employee_skill_events",
            "employee_lessons",
            "employee_weekly_study_focus",
            "agent_output_attributions",
            "agent_runs",
            "extension_warning_events",
            "captured_turns",
            "prompts",
            "alerts",
            "shadow_ai_events",
            "weekly_reports",
            "system_messages",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.execute("UPDATE employees SET risk_score = 0")
        conn.execute("UPDATE agent_budgets SET spend_usd = 0")
        conn.execute("UPDATE employee_skill_profiles SET ai_skill_score = 0.5, prompts_evaluated = 0, last_strengths_json = '[]', last_improvements_json = '[]', assigned_lessons_json = '[]'")
        conn.execute("UPDATE system_jobs SET last_run_at = NULL")
    return {"status": "ok", "message": "All data wiped"}


@router.post("/tick", response_model=TickResponse)
def ops_tick(force: bool = False, _: dict = Depends(require_ops_manager)) -> TickResponse:
    jobs: list[TickJobResult] = []

    due, detail = _job_due("daily_coaching")
    if force or due:
        res = dispatch_daily_coaching()
        _mark_job_run("daily_coaching")
        jobs.append(
            TickJobResult(
                job_name="daily_coaching",
                status="ran",
                generated_count=res.generated_count,
                detail=res.message,
            )
        )
    else:
        jobs.append(TickJobResult(job_name="daily_coaching", status="skipped", generated_count=0, detail=detail))

    due, detail = _job_due("weekly_manager_report")
    if force or due:
        res = dispatch_weekly_manager_report()
        _mark_job_run("weekly_manager_report")
        jobs.append(
            TickJobResult(
                job_name="weekly_manager_report",
                status="ran",
                generated_count=res.generated_count,
                detail=res.message,
            )
        )
    else:
        jobs.append(TickJobResult(job_name="weekly_manager_report", status="skipped", generated_count=0, detail=detail))

    due, detail = _job_due("security_notices")
    if force or due:
        res = dispatch_security_notices()
        _mark_job_run("security_notices")
        jobs.append(
            TickJobResult(
                job_name="security_notices",
                status="ran",
                generated_count=res.generated_count,
                detail=res.message,
            )
        )
    else:
        jobs.append(TickJobResult(job_name="security_notices", status="skipped", generated_count=0, detail=detail))

    due, detail = _job_due("weekly_learning")
    if force or due:
        res = dispatch_weekly_learning_emails()
        _mark_job_run("weekly_learning")
        jobs.append(
            TickJobResult(
                job_name="weekly_learning",
                status="ran",
                generated_count=res.generated_count,
                detail=res.message,
            )
        )
    else:
        jobs.append(TickJobResult(job_name="weekly_learning", status="skipped", generated_count=0, detail=detail))

    return TickResponse(ran_at=_utc_now(), jobs=jobs)
