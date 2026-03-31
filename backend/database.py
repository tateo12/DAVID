from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Generator

import psycopg
from psycopg.rows import dict_row

from config import get_settings, is_postgresql_database, resolved_database_url
from models import ActionType, RiskLevel
from postgres_schema import INIT_STATEMENTS
from sql_adapt import adapt_sql_for_postgres, append_returning_id, should_append_returning_id


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> Path:
    settings = get_settings()
    return Path(__file__).resolve().parent / settings.sqlite_path


def _sqlite_file_for_connect() -> str:
    """Path or :memory: for sqlite3 from resolved DATABASE_URL / sqlite_path."""
    u = resolved_database_url()
    if ":memory:" in u:
        return ":memory:"
    if u.startswith("sqlite:///"):
        rest = u[10:]
        p = Path(rest)
        if not p.is_absolute():
            p = Path(__file__).resolve().parent / rest
        return str(p)
    return str(_db_path())


def _pg_dsn() -> str:
    return resolved_database_url()


class _PgCursor:
    def __init__(self, cur: psycopg.Cursor[Any], lastrowid: int = 0) -> None:
        self._cur = cur
        self._lastrowid = lastrowid

    def fetchone(self) -> Any:
        return self._cur.fetchone()

    def fetchall(self) -> list[Any]:
        return list(self._cur.fetchall())

    @property
    def lastrowid(self) -> int:
        return self._lastrowid


class PgConnection:
    """psycopg connection with SQLite-like execute() (including lastrowid for INSERTs)."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> _PgCursor:
        adapted = adapt_sql_for_postgres(sql)
        need_returning = should_append_returning_id(adapted)
        if need_returning:
            adapted = append_returning_id(adapted)
        cur = self._conn.cursor(row_factory=dict_row)
        cur.execute(adapted, params)
        if need_returning:
            row = cur.fetchone()
            lid = int(row["id"]) if row and row.get("id") is not None else 0
            return _PgCursor(cur, lastrowid=lid)
        return _PgCursor(cur, lastrowid=0)

    def executemany(self, sql: str, seq: list[tuple[Any, ...]]) -> None:
        adapted = adapt_sql_for_postgres(sql)
        with self._conn.cursor() as cur:
            cur.executemany(adapted, seq)


class _SqliteConnWrapper:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
        return self._conn.execute(sql, params)

    def executemany(self, sql: str, seq: list[tuple[Any, ...]]) -> sqlite3.Cursor:
        return self._conn.executemany(sql, seq)

    def executescript(self, script: str) -> None:
        self._conn.executescript(script)


@contextmanager
def get_conn() -> Generator[_SqliteConnWrapper | PgConnection, None, None]:
    if is_postgresql_database():
        conn = psycopg.connect(_pg_dsn(), autocommit=False)
        try:
            yield PgConnection(conn)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(_sqlite_file_for_connect())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield _SqliteConnWrapper(conn)
            conn.commit()
        finally:
            conn.close()


def _ensure_employee_skill_profile_extra_columns_sqlite(conn: Any) -> None:
    try:
        cur = conn.execute("PRAGMA table_info(employee_skill_profiles)")
        cols = {row[1] for row in cur.fetchall()}
    except Exception:
        return
    if not cols:
        return
    for name, decl in (
        ("last_coaching_message", "TEXT NOT NULL DEFAULT ''"),
        ("last_dimension_scores_json", "TEXT NOT NULL DEFAULT '{}'"),
        ("ai_use_profile_summary", "TEXT NOT NULL DEFAULT ''"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE employee_skill_profiles ADD COLUMN {name} {decl}")


def _ensure_skill_lesson_columns_sqlite(conn: Any) -> None:
    try:
        cur = conn.execute("PRAGMA table_info(skill_lessons)")
        cols = {row[1] for row in cur.fetchall()}
    except Exception:
        return
    if not cols:
        return
    for name, decl in (
        ("sequence_order", "INTEGER NOT NULL DEFAULT 0"),
        ("lesson_kind", "TEXT NOT NULL DEFAULT 'lesson'"),
        ("unit_title", "TEXT NOT NULL DEFAULT ''"),
        ("lesson_source", "TEXT NOT NULL DEFAULT 'legacy'"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE skill_lessons ADD COLUMN {name} {decl}")


def import_exported_curriculum_if_needed() -> bool:
    """Load exported_curriculum.md into skill_lessons once. Returns True if curriculum rows exist after."""
    from curriculum_parser import load_curriculum_rows_from_file

    path = Path(__file__).resolve().parent / "exported_curriculum.md"
    rows = load_curriculum_rows_from_file(path)
    if not rows:
        return False
    row = fetch_one(
        "SELECT COUNT(1) AS c FROM skill_lessons WHERE lesson_source = 'exported_curriculum'",
    )
    if row and int(row["c"] or 0) > 0:
        return True
    for r in rows:
        execute(
            """
            INSERT INTO skill_lessons (
                skill_class, title, objective, content, is_active,
                sequence_order, lesson_kind, unit_title, lesson_source
            ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'exported_curriculum')
            """,
            (
                r["skill_class"],
                r["title"],
                r["objective"],
                r["content"],
                r["sequence_order"],
                r["lesson_kind"],
                r["unit_title"],
            ),
        )
    return True


def _ensure_employee_skill_profile_columns_postgres() -> None:
    stmts = [
        "ALTER TABLE employee_skill_profiles ADD COLUMN IF NOT EXISTS last_coaching_message TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE employee_skill_profiles ADD COLUMN IF NOT EXISTS last_dimension_scores_json TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE employee_skill_profiles ADD COLUMN IF NOT EXISTS ai_use_profile_summary TEXT NOT NULL DEFAULT ''",
    ]
    try:
        with psycopg.connect(_pg_dsn(), autocommit=True) as conn:
            with conn.cursor() as cur:
                for s in stmts:
                    try:
                        cur.execute(s)
                    except Exception:
                        pass
    except Exception:
        pass


def _ensure_employee_directory_columns_sqlite(conn: Any) -> None:
    try:
        cur = conn.execute("PRAGMA table_info(employees)")
        cols = {row[1] for row in cur.fetchall()}
    except Exception:
        return
    if not cols:
        return
    for name, decl in (
        ("email", "TEXT NOT NULL DEFAULT ''"),
        ("invite_token", "TEXT"),
        ("invite_sent_at", "TEXT"),
        ("invite_reminder_sent_at", "TEXT"),
        ("account_claimed_at", "TEXT"),
        ("extension_first_seen_at", "TEXT"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE employees ADD COLUMN {name} {decl}")


def _ensure_employee_directory_columns_postgres() -> None:
    stmts = [
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_token TEXT",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_sent_at TEXT",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_reminder_sent_at TEXT",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_claimed_at TEXT",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS extension_first_seen_at TEXT",
    ]
    try:
        with psycopg.connect(_pg_dsn(), autocommit=True) as conn:
            with conn.cursor() as cur:
                for s in stmts:
                    try:
                        cur.execute(s)
                    except Exception:
                        pass
    except Exception:
        pass


def _ensure_skill_lesson_columns_postgres() -> None:
    stmts = [
        "ALTER TABLE skill_lessons ADD COLUMN IF NOT EXISTS sequence_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE skill_lessons ADD COLUMN IF NOT EXISTS lesson_kind TEXT NOT NULL DEFAULT 'lesson'",
        "ALTER TABLE skill_lessons ADD COLUMN IF NOT EXISTS unit_title TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE skill_lessons ADD COLUMN IF NOT EXISTS lesson_source TEXT NOT NULL DEFAULT 'legacy'",
    ]
    try:
        with psycopg.connect(_pg_dsn(), autocommit=True) as conn:
            with conn.cursor() as cur:
                for s in stmts:
                    try:
                        cur.execute(s)
                    except Exception:
                        pass
    except Exception:
        pass


def _ensure_employee_weekly_study_focus_postgres() -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS employee_weekly_study_focus (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        week_start TEXT NOT NULL,
        focus_title TEXT NOT NULL,
        focus_dimensions_json TEXT NOT NULL DEFAULT '[]',
        study_sections_json TEXT NOT NULL DEFAULT '[]',
        baseline_dimension_scores_json TEXT NOT NULL DEFAULT '{}',
        improvement_status TEXT NOT NULL DEFAULT 'monitoring',
        sent_at TEXT NOT NULL,
        last_evaluated_at TEXT,
        active INTEGER NOT NULL DEFAULT 1
    )
    """
    try:
        with psycopg.connect(_pg_dsn(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(ddl)
    except Exception:
        pass


def init_db() -> None:
    if is_postgresql_database():
        conn = psycopg.connect(_pg_dsn(), autocommit=False)
        try:
            with conn.cursor() as cur:
                for stmt in INIT_STATEMENTS:
                    cur.execute(stmt)
            conn.commit()
        finally:
            conn.close()
        _ensure_skill_lesson_columns_postgres()
        _ensure_employee_skill_profile_columns_postgres()
        _ensure_employee_weekly_study_focus_postgres()
        _seed_defaults()
        return

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
                last_coaching_message TEXT NOT NULL DEFAULT '',
                last_dimension_scores_json TEXT NOT NULL DEFAULT '{}',
                ai_use_profile_summary TEXT NOT NULL DEFAULT '',
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
                is_active INTEGER NOT NULL DEFAULT 1,
                sequence_order INTEGER NOT NULL DEFAULT 0,
                lesson_kind TEXT NOT NULL DEFAULT 'lesson',
                unit_title TEXT NOT NULL DEFAULT '',
                lesson_source TEXT NOT NULL DEFAULT 'legacy'
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

            CREATE TABLE IF NOT EXISTS employee_weekly_study_focus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                week_start TEXT NOT NULL,
                focus_title TEXT NOT NULL,
                focus_dimensions_json TEXT NOT NULL DEFAULT '[]',
                study_sections_json TEXT NOT NULL DEFAULT '[]',
                baseline_dimension_scores_json TEXT NOT NULL DEFAULT '{}',
                improvement_status TEXT NOT NULL DEFAULT 'monitoring',
                sent_at TEXT NOT NULL,
                last_evaluated_at TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
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
        _ensure_skill_lesson_columns_sqlite(conn)
        _ensure_employee_skill_profile_extra_columns_sqlite(conn)
        _ensure_employee_directory_columns_sqlite(conn)
    _seed_defaults()


def _seed_defaults() -> None:
    with get_conn() as conn:
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
            settings = get_settings()
            u, p = (settings.initial_admin_username or "").strip(), (settings.initial_admin_password or "").strip()
            if u and p:
                from auth import hash_password
                conn.execute(
                    "INSERT INTO users (username, password, role, employee_id, created_at) VALUES (?, ?, 'manager', NULL, ?)",
                    (u, hash_password(p), _utc_now()),
                )

        job_count = conn.execute("SELECT COUNT(1) as c FROM system_jobs").fetchone()["c"]
        if job_count == 0:
            conn.executemany(
                "INSERT INTO system_jobs (name, interval_seconds, last_run_at, enabled) VALUES (?, ?, ?, 1)",
                [
                    ("daily_coaching", 86400, None),
                    ("weekly_manager_report", 604800, None),
                    ("security_notices", 300, None),
                    ("weekly_learning", 604800, None),
                ],
            )

    import_exported_curriculum_if_needed()
    with get_conn() as conn:
        lesson_count = conn.execute("SELECT COUNT(1) as c FROM skill_lessons").fetchone()["c"]
        if lesson_count == 0:
            conn.executemany(
                """
                INSERT INTO skill_lessons (
                    skill_class, title, objective, content, is_active,
                    sequence_order, lesson_kind, unit_title, lesson_source
                )
                VALUES (?, ?, ?, ?, 1, ?, 'lesson', '', 'legacy')
                """,
                [
                    ("novice", "Prompt Basics", "Write clear task-first prompts", "Use task + context + constraints + output format.", 1),
                    ("developing", "Constraint Design", "Improve output reliability", "Add tone, length, and quality constraints.", 2),
                    ("proficient", "Reasoning Scaffolds", "Get higher quality analysis", "Use step-by-step criteria and rubric checks.", 3),
                    ("advanced", "Workflow Optimization", "Reduce retries and cost", "Chain prompts and use reusable templates.", 4),
                ],
            )


def fetch_rows(query: str, params: tuple[Any, ...] = ()) -> list[Any]:
    with get_conn() as conn:
        return conn.execute(query, params).fetchall()


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> Any:
    with get_conn() as conn:
        return conn.execute(query, params).fetchone()


def execute(query: str, params: tuple[Any, ...] = ()) -> int:
    with get_conn() as conn:
        cur = conn.execute(query, params)
        return int(cur.lastrowid or 0)


def touch_extension_first_seen(employee_id: int) -> None:
    now = _utc_now()
    execute(
        "UPDATE employees SET extension_first_seen_at = COALESCE(extension_first_seen_at, ?) WHERE id = ?",
        (now, employee_id),
    )


def delete_employee_cascade(employee_id: int) -> None:
    execute("DELETE FROM captured_turns WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM extension_warning_events WHERE employee_id = ?", (employee_id,))
    p_rows = fetch_rows("SELECT id FROM prompts WHERE employee_id = ?", (employee_id,))
    pids = [int(r["id"]) for r in p_rows]
    if pids:
        ph = ",".join("?" * len(pids))
        execute(f"DELETE FROM detections WHERE prompt_id IN ({ph})", tuple(pids))
        execute(f"DELETE FROM employee_skill_events WHERE prompt_id IN ({ph})", tuple(pids))
        execute(f"DELETE FROM employee_interaction_memory WHERE prompt_id IN ({ph})", tuple(pids))
    execute("DELETE FROM employee_skill_events WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM employee_interaction_memory WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM prompts WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM shadow_ai_events WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM employee_lessons WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM employee_weekly_study_focus WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM employee_skill_profiles WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM users WHERE employee_id = ?", (employee_id,))
    execute("DELETE FROM employees WHERE id = ?", (employee_id,))


def create_alert(alert_type: str, severity: RiskLevel, detail: str) -> None:
    execute(
        "INSERT INTO alerts (alert_type, severity, detail, is_active, created_at) VALUES (?, ?, ?, ?, ?)",
        (alert_type, severity.value, detail, 1, _utc_now()),
    )


def ensure_employee_skill_profile(employee_id: int) -> None:
    if fetch_one("SELECT 1 FROM employee_skill_profiles WHERE employee_id = ?", (employee_id,)):
        return
    execute(
        """
        INSERT INTO employee_skill_profiles (
            employee_id, ai_skill_score, skill_class, prompts_evaluated,
            last_strengths_json, last_improvements_json, assigned_lessons_json,
            last_coaching_message, last_dimension_scores_json, ai_use_profile_summary, updated_at
        ) VALUES (?, 0.0, 'developing', 0, '[]', '[]', '[]', '', '{}', '', ?)
        """,
        (employee_id, _utc_now()),
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
    coaching_message: str = "",
    ai_use_profile_summary: str = "",
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

    coach = (coaching_message or "")[:2000]
    summary = (ai_use_profile_summary or "")[:4000]
    dims_json = json.dumps(dimension_scores)

    profile = fetch_one(
        "SELECT ai_skill_score, prompts_evaluated FROM employee_skill_profiles WHERE employee_id = ?",
        (employee_id,),
    )
    if not profile:
        new_class = skill_class_from_score(overall_score)
        execute(
            """
            INSERT INTO employee_skill_profiles (
                employee_id, ai_skill_score, skill_class, prompts_evaluated,
                last_strengths_json, last_improvements_json, assigned_lessons_json,
                last_coaching_message, last_dimension_scores_json, ai_use_profile_summary, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                employee_id,
                overall_score,
                new_class,
                1,
                json.dumps(strengths),
                json.dumps(improvements),
                "[]",
                coach,
                dims_json,
                summary,
                _utc_now(),
            ),
        )
        from curriculum_assign import ensure_initial_lesson_if_none_pending

        ensure_initial_lesson_if_none_pending(employee_id, new_class)
        pending_rows = fetch_rows(
            "SELECT lesson_id FROM employee_lessons WHERE employee_id = ? AND status = 'assigned' ORDER BY id DESC",
            (employee_id,),
        )
        execute(
            "UPDATE employee_skill_profiles SET assigned_lessons_json = ? WHERE employee_id = ?",
            (json.dumps([str(r["lesson_id"]) for r in pending_rows]), employee_id),
        )
        from engines.learning_engine import evaluate_active_study_focus

        evaluate_active_study_focus(employee_id)
        return

    previous_score = float(profile["ai_skill_score"] or 0.0)
    previous_count = int(profile["prompts_evaluated"] or 0)
    new_count = previous_count + 1
    new_score = ((previous_score * previous_count) + overall_score) / new_count
    new_class = skill_class_from_score(new_score)
    from curriculum_assign import assign_stack_for_need, ensure_initial_lesson_if_none_pending

    ensure_initial_lesson_if_none_pending(employee_id, new_class)
    emp_risk = fetch_one("SELECT risk_score FROM employees WHERE id = ?", (employee_id,))
    rs = float(emp_risk["risk_score"] or 0.0) if emp_risk else 0.0
    if rs >= 0.45:
        assign_stack_for_need(employee_id, risk_score=rs)
    pending_rows = fetch_rows(
        "SELECT lesson_id FROM employee_lessons WHERE employee_id = ? AND status = 'assigned' ORDER BY id DESC",
        (employee_id,),
    )
    assigned_lessons = [str(r["lesson_id"]) for r in pending_rows]
    execute(
        """
        UPDATE employee_skill_profiles
        SET ai_skill_score = ?, skill_class = ?, prompts_evaluated = ?,
            last_strengths_json = ?, last_improvements_json = ?, assigned_lessons_json = ?,
            last_coaching_message = ?, last_dimension_scores_json = ?, ai_use_profile_summary = ?, updated_at = ?
        WHERE employee_id = ?
        """,
        (
            new_score,
            new_class,
            new_count,
            json.dumps(strengths),
            json.dumps(improvements),
            json.dumps(assigned_lessons),
            coach,
            dims_json,
            summary,
            _utc_now(),
            employee_id,
        ),
    )
    from engines.learning_engine import evaluate_active_study_focus

    evaluate_active_study_focus(employee_id)


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
