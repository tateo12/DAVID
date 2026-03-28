"""
Pytest loads this module before test packages import `main`.

- Forces an isolated SQLite file (not repo `sentinel.db`).
- Seeds minimal rows so tests never rely on demo employees or demo logins.
"""

from __future__ import annotations

import os
from pathlib import Path

_backend_root = Path(__file__).resolve().parent.parent
_test_db = _backend_root / "tests" / ".pytest_sentinel.db"

# SQLite only: override .env DATABASE_URL so tests never hit a dev PostgreSQL.
os.environ["DATABASE_URL"] = ""
os.environ["SQLITE_PATH"] = str(_test_db.relative_to(_backend_root))
# Avoid creating a production bootstrap user during test DB init.
os.environ.pop("SENTINEL_INITIAL_ADMIN_USERNAME", None)
os.environ.pop("SENTINEL_INITIAL_ADMIN_PASSWORD", None)
os.environ.pop("INITIAL_ADMIN_USERNAME", None)
os.environ.pop("INITIAL_ADMIN_PASSWORD", None)

if _test_db.exists():
    _test_db.unlink()

from config import get_settings

get_settings.cache_clear()

from database import _utc_now, execute, fetch_one, init_db

init_db()

if not fetch_one("SELECT 1 FROM employees WHERE id = 1"):
    execute(
        "INSERT INTO employees (id, name, department, role, risk_score) VALUES (1, 'Test Engineer', 'Engineering', 'engineer', 0)",
    )

if not fetch_one("SELECT 1 FROM employee_skill_profiles WHERE employee_id = 1"):
    execute(
        """
        INSERT INTO employee_skill_profiles (
            employee_id, ai_skill_score, skill_class, prompts_evaluated,
            last_strengths_json, last_improvements_json, assigned_lessons_json, updated_at
        ) VALUES (1, 0.5, 'developing', 0, '[]', '[]', '[]', ?)
        """,
        (_utc_now(),),
    )

if not fetch_one("SELECT 1 FROM users WHERE username = 'test_employee'"):
    execute(
        "INSERT INTO users (username, password, role, employee_id, created_at) VALUES ('test_employee', 'testpass', 'employee', 1, ?)",
        (_utc_now(),),
    )

if not fetch_one("SELECT 1 FROM users WHERE username = 'test_manager'"):
    execute(
        "INSERT INTO users (username, password, role, employee_id, created_at) VALUES ('test_manager', 'testpass', 'manager', NULL, ?)",
        (_utc_now(),),
    )
