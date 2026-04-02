from fastapi import Depends, Header, HTTPException

import jwt  # PyJWT

from config import get_settings
from database import _utc_now, execute, fetch_one, init_db


def _parse_bearer(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth scheme")
    return authorization.split(" ", 1)[1].strip()


def _verify_supabase_jwt(token: str) -> dict:
    """Verify a Supabase JWT (HS256) and return the decoded payload."""
    secret = get_settings().supabase_jwt_secret
    if not secret:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured on backend")
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


def _get_db_user(supabase_uid: str) -> dict | None:
    """Return the local DB user row for the given Supabase UID, or None."""
    return fetch_one(
        "SELECT id, username, role, employee_id FROM users WHERE supabase_uid = ?",
        (supabase_uid,),
    )


def provision_user(supabase_uid: str, email: str) -> dict:
    """
    Get or create a local DB user mapped to the given Supabase UID.
    First user auto-assigned 'manager', all subsequent users get 'employee'.
    Returns user dict {id, username, role, employee_id}.
    """
    init_db()
    row = _get_db_user(supabase_uid)
    if row:
        return dict(row)

    count_row = fetch_one("SELECT COUNT(*) as cnt FROM users", ())
    role = "manager" if (count_row and count_row["cnt"] == 0) else "employee"
    username = email or supabase_uid

    execute(
        "INSERT INTO users (supabase_uid, username, password, role, employee_id, created_at) VALUES (?, ?, '', ?, NULL, ?)",
        (supabase_uid, username, role, _utc_now()),
    )
    row = fetch_one(
        "SELECT id, username, role, employee_id FROM users WHERE supabase_uid = ?",
        (supabase_uid,),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to provision user")
    return dict(row)


def get_current_user_optional(authorization: str | None = Header(default=None)) -> dict | None:
    """Verify Supabase JWT when present; None if missing or invalid (no 401)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = _verify_supabase_jwt(token)
    except HTTPException:
        return None
    supabase_uid = payload.get("sub")
    if not supabase_uid:
        return None
    init_db()
    return _get_db_user(supabase_uid)


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    token = _parse_bearer(authorization)
    payload = _verify_supabase_jwt(token)
    supabase_uid = payload.get("sub")
    if not supabase_uid:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub claim")
    init_db()
    row = _get_db_user(supabase_uid)
    if not row:
        raise HTTPException(status_code=401, detail="User not provisioned — call POST /api/auth/provision after sign-in")
    return dict(row)


def require_ops_manager(current_user: dict = Depends(get_current_user)) -> dict:
    """Dispatch, tick, and reset are manager/admin only."""
    role = (current_user.get("role") or "").strip().lower()
    if role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Manager or admin role required for this operation")
    return current_user
