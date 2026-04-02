"""
Pytest loads this module before test packages import `main`.

- Forces an isolated SQLite file (not repo `sentinel.db`).
- Seeds minimal rows so tests never rely on demo employees or demo logins.
- Provides make_token() for generating signed JWTs usable as Bearer tokens.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

_backend_root = Path(__file__).resolve().parent.parent
_test_db = _backend_root / "tests" / ".pytest_sentinel.db"

# Use a fixed test JWT secret — matches SUPABASE_JWT_SECRET in test env.
TEST_JWT_SECRET = "pytest-test-secret-not-for-production"
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET

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

# ── seed employee ────────────────────────────────────────────────────────────
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

# ── seed users with supabase_uid ─────────────────────────────────────────────
TEST_EMPLOYEE_UID = "test-uid-employee"
TEST_MANAGER_UID = "test-uid-manager"

if not fetch_one("SELECT 1 FROM users WHERE supabase_uid = ?", (TEST_EMPLOYEE_UID,)):
    execute(
        "INSERT INTO users (supabase_uid, username, password, role, employee_id, org_id, created_at) VALUES (?, 'test_employee', '', 'employee', 1, 1, ?)",
        (TEST_EMPLOYEE_UID, _utc_now()),
    )

if not fetch_one("SELECT 1 FROM users WHERE supabase_uid = ?", (TEST_MANAGER_UID,)):
    execute(
        "INSERT INTO users (supabase_uid, username, password, role, employee_id, org_id, created_at) VALUES (?, 'test_manager', '', 'manager', NULL, 1, ?)",
        (TEST_MANAGER_UID, _utc_now()),
    )


def make_token(supabase_uid: str, email: str = "") -> str:
    """Return a signed HS256 JWT accepted by get_current_user in tests."""
    payload = {
        "sub": supabase_uid,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


EMPLOYEE_TOKEN: str = make_token(TEST_EMPLOYEE_UID, "employee@test.com")
MANAGER_TOKEN: str = make_token(TEST_MANAGER_UID, "manager@test.com")
