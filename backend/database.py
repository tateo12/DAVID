import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Generator

from config import get_settings
from models import ActionType, RiskLevel


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> Path:
    settings = get_settings()
    return Path(__file__).resolve().parent / settings.sqlite_path


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                department TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'employee',
                risk_score REAL NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                prompt_text TEXT NOT NULL,
                redacted_prompt TEXT,
                target_tool TEXT,
                risk_level TEXT NOT NULL,
                action TEXT NOT NULL,
                layer_used TEXT NOT NULL,
                confidence REAL NOT NULL,
                estimated_cost_usd REAL NOT NULL DEFAULT 0,
                coaching_tip TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                subtype TEXT NOT NULL,
                severity TEXT NOT NULL,
                detail TEXT NOT NULL,
                span_start INTEGER NOT NULL,
                span_end INTEGER NOT NULL,
                confidence REAL NOT NULL,
                layer TEXT NOT NULL,
                FOREIGN KEY (prompt_id) REFERENCES prompts (id)
            );

            CREATE TABLE IF NOT EXISTS policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                rule_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                budget_usd REAL NOT NULL,
                spend_usd REAL NOT NULL DEFAULT 0,
                quality_score REAL NOT NULL DEFAULT 0.8,
                success_rate REAL NOT NULL DEFAULT 0.8
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                detail TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS weekly_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                week_start TEXT NOT NULL,
                week_end TEXT NOT NULL,
                summary TEXT NOT NULL,
                kpis_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shadow_ai_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                tool_domain TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                employee_id INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );

            CREATE TABLE IF NOT EXISTS captured_turns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                target_tool TEXT,
                conversation_id TEXT,
                turn_id TEXT,
                prompt_prompt_id INTEGER NOT NULL,
                output_prompt_id INTEGER NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id),
                FOREIGN KEY (prompt_prompt_id) REFERENCES prompts (id),
                FOREIGN KEY (output_prompt_id) REFERENCES prompts (id)
            );

            CREATE TABLE IF NOT EXISTS extension_warning_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                warning_context_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                target_tool TEXT,
                details_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS agent_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id INTEGER NOT NULL,
                task_type TEXT NOT NULL,
                cost_usd REAL NOT NULL DEFAULT 0,
                success INTEGER NOT NULL,
                latency_ms INTEGER NOT NULL,
                quality_score REAL NOT NULL DEFAULT 0,
                value_score REAL NOT NULL DEFAULT 0,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agent_budgets (id)
            );

            CREATE TABLE IF NOT EXISTS agent_output_attributions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id INTEGER NOT NULL,
                run_id INTEGER,
                output_ref TEXT NOT NULL,
                revenue_impact_usd REAL NOT NULL DEFAULT 0,
                cost_saved_usd REAL NOT NULL DEFAULT 0,
                quality_outcome_score REAL NOT NULL DEFAULT 0,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agent_budgets (id),
                FOREIGN KEY (run_id) REFERENCES agent_runs (id)
            );

            CREATE TABLE IF NOT EXISTS employee_skill_profiles (
                employee_id INTEGER PRIMARY KEY,
                ai_skill_score REAL NOT NULL DEFAULT 0.0,
                skill_class TEXT NOT NULL DEFAULT 'developing',
                prompts_evaluated INTEGER NOT NULL DEFAULT 0,
                last_strengths_json TEXT NOT NULL DEFAULT '[]',
                last_improvements_json TEXT NOT NULL DEFAULT '[]',
                assigned_lessons_json TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS employee_skill_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                prompt_id INTEGER NOT NULL,
                overall_score REAL NOT NULL,
                dimension_scores_json TEXT NOT NULL,
                strengths_json TEXT NOT NULL,
                improvements_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id),
                FOREIGN KEY (prompt_id) REFERENCES prompts (id)
            );

            CREATE TABLE IF NOT EXISTS employee_interaction_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                prompt_id INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                action TEXT NOT NULL,
                skill_score REAL NOT NULL DEFAULT 0,
                skill_class TEXT NOT NULL DEFAULT 'developing',
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees (id),
                FOREIGN KEY (prompt_id) REFERENCES prompts (id)
            );

            CREATE TABLE IF NOT EXISTS skill_lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                skill_class TEXT NOT NULL,
                title TEXT NOT NULL,
                objective TEXT NOT NULL,
                content TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS employee_lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                lesson_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'assigned',
                assigned_at TEXT NOT NULL,
                completed_at TEXT,
                FOREIGN KEY (employee_id) REFERENCES employees (id),
                FOREIGN KEY (lesson_id) REFERENCES skill_lessons (id)
            );

            CREATE TABLE IF NOT EXISTS system_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient_type TEXT NOT NULL,
                recipient_id INTEGER,
                message_type TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                related_entity TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS system_jobs (
                name TEXT PRIMARY KEY,
                interval_seconds INTEGER NOT NULL,
                last_run_at TEXT,
                enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS alert_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id INTEGER NOT NULL,
                notified_at TEXT NOT NULL,
                UNIQUE(alert_id),
                FOREIGN KEY (alert_id) REFERENCES alerts (id)
            );
            """
        )
    _seed_defaults()


def _seed_defaults() -> None:
    with get_conn() as conn:
        employee_count = conn.execute("SELECT COUNT(1) as c FROM employees").fetchone()["c"]
        if employee_count == 0:
            conn.executemany(
                "INSERT INTO employees (id, name, department, role, risk_score) VALUES (?, ?, ?, ?, ?)",
                [
                    (1, "Alice Kim", "Engineering", "engineer", 0.1),
                    (2, "Bob Diaz", "Sales", "sales", 0.2),
                    (3, "Cara Singh", "Support", "support", 0.15),
                ],
            )

        policy_count = conn.execute("SELECT COUNT(1) as c FROM policies").fetchone()["c"]
        if policy_count == 0:
            default_rule = {
                "blocked_tools": ["unknown-ai.example"],
                "forbidden_keywords": ["confidential", "internal-only"],
                "allow_code_paste_roles": ["engineer"],
            }
            conn.execute(
                "INSERT INTO policies (name, role, rule_json, updated_at) VALUES (?, ?, ?, ?)",
                ("global_default", "all", json.dumps(default_rule), _utc_now()),
            )

        budget_count = conn.execute("SELECT COUNT(1) as c FROM agent_budgets").fetchone()["c"]
        if budget_count == 0:
            default_budget = get_settings().default_agent_budget_usd
            conn.executemany(
                "INSERT INTO agent_budgets (name, budget_usd, spend_usd, quality_score, success_rate) VALUES (?, ?, ?, ?, ?)",
                [
                    ("triage_agent", default_budget, 2.5, 0.84, 0.82),
                    ("report_agent", default_budget, 3.1, 0.88, 0.86),
                ],
            )

        report_count = conn.execute("SELECT COUNT(1) as c FROM weekly_reports").fetchone()["c"]
        if report_count == 0:
            week_end = datetime.now(timezone.utc)
            week_start = week_end - timedelta(days=7)
            baseline = {
                "threats_blocked": 0,
                "prompts_analyzed": 0,
                "estimated_cost_saved_usd": 0.0,
            }
            conn.execute(
                "INSERT INTO weekly_reports (week_start, week_end, summary, kpis_json) VALUES (?, ?, ?, ?)",
                (
                    week_start.date().isoformat(),
                    week_end.date().isoformat(),
                    "Baseline report initialized.",
                    json.dumps(baseline),
                ),
            )

        user_count = conn.execute("SELECT COUNT(1) as c FROM users").fetchone()["c"]
        if user_count == 0:
            conn.executemany(
                "INSERT INTO users (username, password, role, employee_id, created_at) VALUES (?, ?, ?, ?, ?)",
                [
                    ("employee1", "demo123", "employee", 1, _utc_now()),
                    ("employee2", "demo123", "employee", 2, _utc_now()),
                    ("employee3", "demo123", "employee", 3, _utc_now()),
                    ("manager1", "demo123", "manager", None, _utc_now()),
                ],
            )

        for employee_id in [1, 2, 3]:
            exists = conn.execute(
                "SELECT COUNT(1) AS c FROM employee_skill_profiles WHERE employee_id = ?",
                (employee_id,),
            ).fetchone()["c"]
            if not exists:
                conn.execute(
                    """
                    INSERT INTO employee_skill_profiles (
                        employee_id, ai_skill_score, skill_class, prompts_evaluated, last_strengths_json, last_improvements_json, assigned_lessons_json, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (employee_id, 0.5, "developing", 0, "[]", "[]", "[]", _utc_now()),
                )

        lesson_count = conn.execute("SELECT COUNT(1) as c FROM skill_lessons").fetchone()["c"]
        if lesson_count == 0:
            conn.executemany(
                """
                INSERT INTO skill_lessons (skill_class, title, objective, content, is_active)
                VALUES (?, ?, ?, ?, 1)
                """,
                [
                    ("novice", "Prompt Basics", "Write clear task-first prompts", "Use task + context + constraints + output format."),
                    ("developing", "Constraint Design", "Improve output reliability", "Add tone, length, and quality constraints."),
                    ("proficient", "Reasoning Scaffolds", "Get higher quality analysis", "Use step-by-step criteria and rubric checks."),
                    ("advanced", "Workflow Optimization", "Reduce retries and cost", "Chain prompts and use reusable templates."),
                ],
            )

        job_count = conn.execute("SELECT COUNT(1) as c FROM system_jobs").fetchone()["c"]
        if job_count == 0:
            conn.executemany(
                "INSERT INTO system_jobs (name, interval_seconds, last_run_at, enabled) VALUES (?, ?, ?, 1)",
                [
                    ("daily_coaching", 86400, None),
                    ("weekly_manager_report", 604800, None),
                    ("security_notices", 300, None),
                ],
            )


def fetch_rows(query: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(query, params).fetchall()


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute(query, params).fetchone()


def execute(query: str, params: tuple[Any, ...] = ()) -> int:
    with get_conn() as conn:
        cur = conn.execute(query, params)
        return cur.lastrowid


def create_alert(alert_type: str, severity: RiskLevel, detail: str) -> None:
    execute(
        "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, ?, ?)",
        (alert_type, severity.value, detail, 1, _utc_now()),
    )


def update_employee_risk(employee_id: int) -> None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
                AVG(CASE risk_level
                    WHEN 'critical' THEN 1.0
                    WHEN 'high' THEN 0.75
                    WHEN 'medium' THEN 0.5
                    ELSE 0.2 END) AS avg_risk
            FROM prompts
            WHERE employee_id = ?
            """,
            (employee_id,),
        ).fetchone()
        risk = float(row["avg_risk"] or 0.0)
        conn.execute("UPDATE employees SET risk_score = ? WHERE id = ?", (risk, employee_id))


def create_prompt_record(
    employee_id: int,
    prompt_text: str,
    redacted_prompt: str | None,
    target_tool: str | None,
    risk_level: RiskLevel,
    action: ActionType,
    layer_used: str,
    confidence: float,
    estimated_cost_usd: float,
    coaching_tip: str | None,
    metadata: dict[str, Any] | None,
) -> int:
    prompt_id = execute(
        """
        INSERT INTO prompts (
            employee_id, prompt_text, redacted_prompt, target_tool, risk_level, action,
            layer_used, confidence, estimated_cost_usd, coaching_tip, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            employee_id,
            prompt_text,
            redacted_prompt,
            target_tool,
            risk_level.value,
            action.value,
            layer_used,
            confidence,
            estimated_cost_usd,
            coaching_tip,
            json.dumps(metadata or {}),
            _utc_now(),
        ),
    )
    update_employee_risk(employee_id)
    return prompt_id


def create_captured_turn_record(
    employee_id: int,
    target_tool: str | None,
    conversation_id: str | None,
    turn_id: str | None,
    prompt_prompt_id: int,
    output_prompt_id: int,
    metadata: dict[str, Any] | None,
) -> int:
    return execute(
        """
        INSERT INTO captured_turns (
            employee_id, target_tool, conversation_id, turn_id, prompt_prompt_id, output_prompt_id, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            employee_id,
            target_tool,
            conversation_id,
            turn_id,
            prompt_prompt_id,
            output_prompt_id,
            json.dumps(metadata or {}),
            _utc_now(),
        ),
    )


def create_extension_warning_event(
    employee_id: int,
    warning_context_id: str,
    event_type: str,
    risk_level: str,
    target_tool: str | None,
    details: dict[str, Any] | None,
) -> int:
    return execute(
        """
        INSERT INTO extension_warning_events (
            employee_id, warning_context_id, event_type, risk_level, target_tool, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            employee_id,
            warning_context_id,
            event_type,
            risk_level,
            target_tool,
            json.dumps(details or {}),
            _utc_now(),
        ),
    )


def record_skill_evaluation(
    employee_id: int,
    prompt_id: int,
    overall_score: float,
    dimension_scores: dict[str, Any],
    strengths: list[str],
    improvements: list[str],
) -> None:
    execute(
        """
        INSERT INTO employee_skill_events (
            employee_id, prompt_id, overall_score, dimension_scores_json, strengths_json, improvements_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            employee_id,
            prompt_id,
            overall_score,
            json.dumps(dimension_scores),
            json.dumps(strengths),
            json.dumps(improvements),
            _utc_now(),
        ),
    )
    from engines.coaching_engine import skill_class_from_score

    profile = fetch_one(
        "SELECT ai_skill_score, prompts_evaluated FROM employee_skill_profiles WHERE employee_id = ?",
        (employee_id,),
    )
    if not profile:
        execute(
            """
            INSERT INTO employee_skill_profiles (
                employee_id, ai_skill_score, skill_class, prompts_evaluated, last_strengths_json, last_improvements_json, assigned_lessons_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                employee_id,
                overall_score,
                skill_class_from_score(overall_score),
                1,
                json.dumps(strengths),
                json.dumps(improvements),
                "[]",
                _utc_now(),
            ),
        )
        return

    previous_score = float(profile["ai_skill_score"] or 0.0)
    previous_count = int(profile["prompts_evaluated"] or 0)
    new_count = previous_count + 1
    new_score = ((previous_score * previous_count) + overall_score) / new_count
    new_class = skill_class_from_score(new_score)
    pending_rows = fetch_rows(
        "SELECT lesson_id FROM employee_lessons WHERE employee_id = ? AND status = 'assigned' ORDER BY id DESC",
        (employee_id,),
    )
    assigned_lessons = [str(r["lesson_id"]) for r in pending_rows]
    # Auto-assign one lesson matching the new class if none pending.
    if not pending_rows:
        lesson = fetch_one(
            "SELECT id FROM skill_lessons WHERE skill_class = ? AND is_active = 1 ORDER BY id LIMIT 1",
            (new_class,),
        )
        if lesson:
            execute(
                "INSERT INTO employee_lessons (employee_id, lesson_id, status, assigned_at) VALUES (?, ?, 'assigned', ?)",
                (employee_id, lesson["id"], _utc_now()),
            )
            assigned_lessons = [str(lesson["id"])]
    execute(
        """
        UPDATE employee_skill_profiles
        SET ai_skill_score = ?, skill_class = ?, prompts_evaluated = ?, last_strengths_json = ?, last_improvements_json = ?, assigned_lessons_json = ?, updated_at = ?
        WHERE employee_id = ?
        """,
        (
            new_score,
            new_class,
            new_count,
            json.dumps(strengths),
            json.dumps(improvements),
            json.dumps(assigned_lessons),
            _utc_now(),
            employee_id,
        ),
    )


def record_employee_interaction_memory(
    employee_id: int,
    prompt_id: int,
    risk_level: str,
    action: str,
    skill_score: float,
    skill_class: str,
) -> None:
    execute(
        """
        INSERT INTO employee_interaction_memory (
            employee_id, prompt_id, risk_level, action, skill_score, skill_class, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (employee_id, prompt_id, risk_level, action, skill_score, skill_class, _utc_now()),
    )
