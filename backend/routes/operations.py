import json
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from database import execute, fetch_one, fetch_rows, get_conn
from engines.analysis_engine import analyze_prompt
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
    last = datetime.fromisoformat(last_run_at)
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
    return analyze_prompt(payload)


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
        improvements = json.loads(row["last_improvements_json"] or "[]")
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
def dispatch_weekly_manager_report() -> DispatchResult:
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


@router.post("/dispatch/security-notices", response_model=DispatchResult)
def dispatch_security_notices() -> DispatchResult:
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

    return analyze_prompt(
        AnalyzeRequest(
            employee_id=payload.employee_id,
            prompt_text=payload.code_text,
            target_tool=payload.target_tool or "code_submit_hook",
            metadata={"event_type": "engineer_code_submit", **(payload.metadata or {})},
        )
    )


@router.post("/seed-agents", response_model=DispatchResult)
def seed_agent_demo_data() -> DispatchResult:
    """Populate agent tables with realistic demo data for the last 7 days."""

    # ── Agent definitions ────────────────────────────────────────────
    # Each tuple: (name, budget, task_types, avg_cost_range, avg_latency_range,
    #              quality_range, value_range, success_weight, runs_target)
    AGENTS = [
        {
            "name": "CodeGuard",
            "budget_usd": 50.0,
            "tasks": ["code_review", "vulnerability_scan", "dependency_audit"],
            "cost": (0.02, 0.18),
            "latency": (800, 4500),
            "quality": (0.78, 0.96),
            "value": (0.70, 0.95),
            "success_pct": 0.92,
            "runs": 28,
        },
        {
            "name": "DocuMind",
            "budget_usd": 35.0,
            "tasks": ["doc_generation", "summary", "knowledge_extract"],
            "cost": (0.01, 0.08),
            "latency": (400, 2200),
            "quality": (0.82, 0.98),
            "value": (0.75, 0.92),
            "success_pct": 0.95,
            "runs": 25,
        },
        {
            "name": "SalesBot",
            "budget_usd": 40.0,
            "tasks": ["lead_scoring", "email_draft", "objection_handling", "proposal_gen"],
            "cost": (0.03, 0.22),
            "latency": (600, 3800),
            "quality": (0.60, 0.88),
            "value": (0.55, 0.85),
            "success_pct": 0.78,
            "runs": 32,
        },
        {
            "name": "DataPipe",
            "budget_usd": 60.0,
            "tasks": ["etl_transform", "anomaly_detect", "schema_migration", "data_validation"],
            "cost": (0.05, 0.35),
            "latency": (1200, 8000),
            "quality": (0.70, 0.92),
            "value": (0.65, 0.90),
            "success_pct": 0.84,
            "runs": 22,
        },
        {
            "name": "HelpDesk AI",
            "budget_usd": 30.0,
            "tasks": ["ticket_triage", "response_draft", "escalation_check"],
            "cost": (0.005, 0.06),
            "latency": (200, 1500),
            "quality": (0.85, 0.97),
            "value": (0.80, 0.96),
            "success_pct": 0.96,
            "runs": 30,
        },
        {
            "name": "MarketingGen",
            "budget_usd": 25.0,
            "tasks": ["copy_generation", "ab_test_variant", "social_post", "seo_optimize"],
            "cost": (0.02, 0.15),
            "latency": (500, 3000),
            "quality": (0.55, 0.82),
            "value": (0.50, 0.78),
            "success_pct": 0.72,
            "runs": 20,
        },
    ]

    now = datetime.now(timezone.utc)
    total_runs = 0

    with get_conn() as conn:
        for agent_def in AGENTS:
            # Upsert agent into agent_budgets
            existing = conn.execute(
                "SELECT id FROM agent_budgets WHERE name = ?", (agent_def["name"],)
            ).fetchone()

            if existing:
                agent_id = existing["id"]
                conn.execute(
                    "UPDATE agent_budgets SET budget_usd = ? WHERE id = ?",
                    (agent_def["budget_usd"], agent_id),
                )
            else:
                cur = conn.execute(
                    "INSERT INTO agent_budgets (name, budget_usd, spend_usd, quality_score, success_rate) VALUES (?, ?, 0, 0.8, 0.8)",
                    (agent_def["name"], agent_def["budget_usd"]),
                )
                agent_id = cur.lastrowid

            # Clear old seeded runs for this agent so endpoint is idempotent
            conn.execute("DELETE FROM agent_runs WHERE agent_id = ?", (agent_id,))

            # Generate runs spread across the last 7 days
            num_runs = agent_def["runs"] + random.randint(-3, 3)
            cost_lo, cost_hi = agent_def["cost"]
            lat_lo, lat_hi = agent_def["latency"]
            q_lo, q_hi = agent_def["quality"]
            v_lo, v_hi = agent_def["value"]

            total_cost = 0.0
            quality_sum = 0.0
            success_count = 0

            for i in range(num_runs):
                # Spread timestamps across 7 days with some clustering
                hours_ago = random.uniform(0.5, 168)  # 0.5h to 7 days
                run_time = now - timedelta(hours=hours_ago)

                cost = round(random.uniform(cost_lo, cost_hi), 4)
                latency = random.randint(lat_lo, lat_hi)
                quality = round(random.uniform(q_lo, q_hi), 3)
                value = round(random.uniform(v_lo, v_hi), 3)
                success = 1 if random.random() < agent_def["success_pct"] else 0
                task = random.choice(agent_def["tasks"])

                conn.execute(
                    """
                    INSERT INTO agent_runs (
                        agent_id, task_type, cost_usd, success, latency_ms,
                        quality_score, value_score, metadata_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        agent_id,
                        task,
                        cost,
                        success,
                        latency,
                        quality,
                        value,
                        json.dumps({"seeded": True, "run_index": i}),
                        run_time.isoformat(),
                    ),
                )
                total_cost += cost
                quality_sum += quality
                success_count += success
                total_runs += 1

            # Update the rollup stats on agent_budgets
            avg_quality = round(quality_sum / max(num_runs, 1), 3)
            success_rate = round(success_count / max(num_runs, 1), 3)
            conn.execute(
                "UPDATE agent_budgets SET spend_usd = ?, quality_score = ?, success_rate = ? WHERE id = ?",
                (round(total_cost, 2), avg_quality, success_rate, agent_id),
            )

        # ── Seed a few agent-related alerts ──────────────────────────
        # Budget warning for DataPipe (highest spender)
        conn.execute(
            "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
            (
                "agent_budget_warning",
                "medium",
                "Agent DataPipe has used 87% of its weekly budget ($52.20 / $60.00). Consider reviewing task volume.",
                (now - timedelta(hours=6)).isoformat(),
            ),
        )
        # SalesBot quality degradation
        conn.execute(
            "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
            (
                "agent_quality_drop",
                "medium",
                "Agent SalesBot quality score dropped below 0.70 threshold over the last 24 hours. Success rate: 78%.",
                (now - timedelta(hours=14)).isoformat(),
            ),
        )
        # MarketingGen low success rate
        conn.execute(
            "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
            (
                "agent_low_success",
                "high",
                "Agent MarketingGen success rate fell to 72% — below the 75% minimum. 6 failed tasks in the last 48 hours.",
                (now - timedelta(hours=3)).isoformat(),
            ),
        )
        # HelpDesk AI positive alert
        conn.execute(
            "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
            (
                "agent_performance_excellent",
                "low",
                "Agent HelpDesk AI sustained 96% success rate with highest quality scores. Budget rebalance recommendation: +10%.",
                (now - timedelta(hours=24)).isoformat(),
            ),
        )
        # CodeGuard budget overrun near-miss
        conn.execute(
            "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
            (
                "agent_budget_warning",
                "low",
                "Agent CodeGuard approaching 75% budget utilization. Current spend trending within normal range.",
                (now - timedelta(hours=48)).isoformat(),
            ),
        )

    return DispatchResult(
        generated_count=total_runs,
        message=f"Seeded {len(AGENTS)} agents with {total_runs} runs and 5 alerts.",
    )


@router.post("/reset")
def reset_all_data() -> dict:
    """Wipe all transactional data, keep employees and config."""
    with get_conn() as conn:
        for table in [
            "prompts", "detections", "alerts", "shadow_ai_events",
            "captured_turns", "agent_runs", "weekly_reports",
            "auth_sessions", "system_messages", "employee_skill_events",
            "employee_lessons",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.execute("UPDATE employees SET risk_score = 0")
        conn.execute("UPDATE agent_budgets SET spend_usd = 0")
        conn.execute("UPDATE employee_skill_profiles SET ai_skill_score = 0.5, prompts_evaluated = 0, last_strengths_json = '[]', last_improvements_json = '[]', assigned_lessons_json = '[]'")
        conn.execute("UPDATE system_jobs SET last_run_at = NULL")
    return {"status": "ok", "message": "All data wiped"}


@router.post("/tick", response_model=TickResponse)
def ops_tick(force: bool = False) -> TickResponse:
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

    return TickResponse(ran_at=_utc_now(), jobs=jobs)
