"""DDL for PostgreSQL (mirrors SQLite schema in database.py)."""

# Order respects foreign keys. Types chosen for compatibility with existing app code.
INIT_STATEMENTS: list[str] = [
    """
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        company_name TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prompts (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        prompt_text TEXT NOT NULL,
        redacted_prompt TEXT,
        target_tool TEXT,
        risk_level TEXT NOT NULL,
        action TEXT NOT NULL,
        layer_used TEXT NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        coaching_tip TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS detections (
        id SERIAL PRIMARY KEY,
        prompt_id INTEGER NOT NULL REFERENCES prompts (id),
        type TEXT NOT NULL,
        subtype TEXT NOT NULL,
        severity TEXT NOT NULL,
        detail TEXT NOT NULL,
        span_start INTEGER NOT NULL,
        span_end INTEGER NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        layer TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS policies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        rule_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_budgets (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        budget_usd DOUBLE PRECISION NOT NULL,
        spend_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        quality_score DOUBLE PRECISION NOT NULL DEFAULT 0.8,
        success_rate DOUBLE PRECISION NOT NULL DEFAULT 0.8
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        detail TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS weekly_reports (
        id SERIAL PRIMARY KEY,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        summary TEXT NOT NULL,
        kpis_json TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shadow_ai_events (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        tool_domain TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        employee_id INTEGER REFERENCES employees (id),
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id),
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS captured_turns (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        target_tool TEXT,
        conversation_id TEXT,
        turn_id TEXT,
        prompt_prompt_id INTEGER NOT NULL REFERENCES prompts (id),
        output_prompt_id INTEGER NOT NULL REFERENCES prompts (id),
        metadata_json TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS extension_warning_events (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        warning_context_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        target_tool TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_runs (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agent_budgets (id),
        task_type TEXT NOT NULL,
        cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        success INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        quality_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        value_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_output_attributions (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agent_budgets (id),
        run_id INTEGER REFERENCES agent_runs (id),
        output_ref TEXT NOT NULL,
        revenue_impact_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        cost_saved_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        quality_outcome_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS employee_skill_profiles (
        employee_id INTEGER PRIMARY KEY REFERENCES employees (id),
        ai_skill_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
        skill_class TEXT NOT NULL DEFAULT 'developing',
        prompts_evaluated INTEGER NOT NULL DEFAULT 0,
        last_strengths_json TEXT NOT NULL DEFAULT '[]',
        last_improvements_json TEXT NOT NULL DEFAULT '[]',
        assigned_lessons_json TEXT NOT NULL DEFAULT '[]',
        last_coaching_message TEXT NOT NULL DEFAULT '',
        last_dimension_scores_json TEXT NOT NULL DEFAULT '{}',
        ai_use_profile_summary TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS employee_skill_events (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        prompt_id INTEGER NOT NULL REFERENCES prompts (id),
        overall_score DOUBLE PRECISION NOT NULL,
        dimension_scores_json TEXT NOT NULL,
        strengths_json TEXT NOT NULL,
        improvements_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS employee_interaction_memory (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        prompt_id INTEGER NOT NULL REFERENCES prompts (id),
        risk_level TEXT NOT NULL,
        action TEXT NOT NULL,
        skill_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        skill_class TEXT NOT NULL DEFAULT 'developing',
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_lessons (
        id SERIAL PRIMARY KEY,
        skill_class TEXT NOT NULL,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        content TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        sequence_order INTEGER NOT NULL DEFAULT 0,
        lesson_kind TEXT NOT NULL DEFAULT 'lesson',
        unit_title TEXT NOT NULL DEFAULT '',
        lesson_source TEXT NOT NULL DEFAULT 'legacy'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS employee_lessons (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees (id),
        lesson_id INTEGER NOT NULL REFERENCES skill_lessons (id),
        status TEXT NOT NULL DEFAULT 'assigned',
        assigned_at TEXT NOT NULL,
        completed_at TEXT
    )
    """,
    """
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
    """,
    """
    CREATE TABLE IF NOT EXISTS system_messages (
        id SERIAL PRIMARY KEY,
        recipient_type TEXT NOT NULL,
        recipient_id INTEGER,
        message_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        related_entity TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS system_jobs (
        name TEXT PRIMARY KEY,
        interval_seconds INTEGER NOT NULL,
        last_run_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS alert_notifications (
        id SERIAL PRIMARY KEY,
        alert_id INTEGER NOT NULL REFERENCES alerts (id),
        notified_at TEXT NOT NULL,
        UNIQUE(alert_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_otps (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        role TEXT NOT NULL,
        company_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    )
    """,
]
