import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException

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
