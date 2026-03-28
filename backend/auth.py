import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException

from database import execute, fetch_one, init_db


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_bearer(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth scheme")
    return authorization.split(" ", 1)[1].strip()


def create_session(username: str, password: str) -> dict:
    init_db()
    user = fetch_one(
        "SELECT id, username, role, employee_id FROM users WHERE username = ? AND password = ?",
        (username, password),
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = secrets.token_urlsafe(32)
    expires_at = _utc_now() + timedelta(hours=12)
    execute(
        "INSERT INTO auth_sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (user["id"], token, expires_at.isoformat(), _utc_now().isoformat()),
    )
    return {
        "access_token": token,
        "expires_at": expires_at.isoformat(),
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "employee_id": user["employee_id"],
        },
    }


def get_current_user_optional(authorization: str | None = Header(default=None)) -> dict | None:
    """Bearer JWT when present and valid; None if missing or invalid (no 401)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    init_db()
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    row = fetch_one(
        """
        SELECT u.id, u.username, u.role, u.employee_id, s.expires_at
        FROM auth_sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
        """,
        (token,),
    )
    if not row:
        return None
    if _utc_now() > datetime.fromisoformat(row["expires_at"]):
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "employee_id": row["employee_id"],
    }


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    init_db()
    token = _parse_bearer(authorization)
    row = fetch_one(
        """
        SELECT u.id, u.username, u.role, u.employee_id, s.expires_at
        FROM auth_sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
        """,
        (token,),
    )
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if _utc_now() > datetime.fromisoformat(row["expires_at"]):
        raise HTTPException(status_code=401, detail="Session expired")
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "employee_id": row["employee_id"],
    }


def require_ops_manager(current_user: dict = Depends(get_current_user)) -> dict:
    """Dispatch, tick, and reset are manager/admin only (Bearer session)."""
    role = (current_user.get("role") or "").strip().lower()
    if role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Manager or admin role required for this operation")
    return current_user
