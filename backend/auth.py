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
    row = fetch_one(
        """SELECT u.id, u.username, u.role, u.employee_id, u.org_id,
                  COALESCE(o.name, '') AS org_name
           FROM users u
           LEFT JOIN organizations o ON o.id = u.org_id
           WHERE u.supabase_uid = ?""",
        (supabase_uid,),
    )
    return dict(row) if row else None


def _create_organization(name: str, slug: str) -> int:
    """Create a new organization and return its id."""
    now = _utc_now()
    return execute(
        "INSERT INTO organizations (name, slug, plan, max_seats, settings_json, created_at, updated_at) VALUES (?, ?, 'pilot', 10, '{}', ?, ?)",
        (name, slug, now, now),
    )


def _slug_from_email(email: str) -> str:
    """Derive a URL-safe org slug from an email domain."""
    import re
    domain = email.split("@")[-1] if "@" in email else "org"
    slug = re.sub(r"[^a-z0-9]+", "-", domain.lower()).strip("-")
    # Ensure uniqueness by appending a suffix if needed
    base = slug
    counter = 0
    while fetch_one("SELECT 1 FROM organizations WHERE slug = ?", (slug,)):
        counter += 1
        slug = f"{base}-{counter}"
    return slug


def provision_user(supabase_uid: str, email: str, org_id: int | None = None) -> dict:
    """
    Get or create a local DB user mapped to the given Supabase UID.
    If org_id is provided, the user joins that org.
    Otherwise, a new org is created and the user becomes its manager.
    First user of an org is auto-assigned 'manager', subsequent users get 'employee'.
    Returns user dict {id, username, role, employee_id, org_id, org_name}.
    """
    init_db()
    row = _get_db_user(supabase_uid)
    if row:
        return row

    username = email or supabase_uid

    # Determine or create the org
    if org_id is None:
        # New signup without invite — create a new org
        domain = email.split("@")[-1] if "@" in email else "Organization"
        org_name = domain.split(".")[0].capitalize() if "." in domain else domain
        slug = _slug_from_email(email)
        org_id = _create_organization(org_name, slug)

    # First user of this org becomes manager
    count_row = fetch_one("SELECT COUNT(*) as cnt FROM users WHERE org_id = ?", (org_id,))
    role = "manager" if (count_row and count_row["cnt"] == 0) else "employee"

    execute(
        "INSERT INTO users (supabase_uid, username, password, role, employee_id, org_id, created_at) VALUES (?, ?, '', ?, NULL, ?, ?)",
        (supabase_uid, username, role, org_id, _utc_now()),
    )

    # Set owner_user_id on the org if this is the first user (manager)
    if role == "manager":
        user_row = fetch_one("SELECT id FROM users WHERE supabase_uid = ?", (supabase_uid,))
        if user_row:
            execute("UPDATE organizations SET owner_user_id = ? WHERE id = ?", (user_row["id"], org_id))

    row = _get_db_user(supabase_uid)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to provision user")
    return row


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
    return row


def get_org_id(current_user: dict) -> int:
    """Extract org_id from the current user dict. Raises 403 if missing."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="No organization context")
    return int(org_id)


def require_ops_manager(current_user: dict = Depends(get_current_user)) -> dict:
    """Dispatch, tick, and reset are manager/admin only."""
    role = (current_user.get("role") or "").strip().lower()
    if role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Manager or admin role required for this operation")
    return current_user
