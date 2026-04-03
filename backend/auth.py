from __future__ import annotations

import time
from typing import Any

from fastapi import Depends, Header, HTTPException

import jwt  # PyJWT
import requests

from config import get_settings
from database import _utc_now, execute, fetch_one, init_db

# ── JWKS cache for ES256 / asymmetric verification ────────────────────────────
_jwks_cache: dict[str, Any] = {"keys": [], "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 300  # re-fetch every 5 minutes


def _get_jwks_keys() -> list[dict]:
    """Fetch and cache JWKS public keys from Supabase."""
    now = time.time()
    if _jwks_cache["keys"] and (now - _jwks_cache["fetched_at"]) < _JWKS_TTL_SECONDS:
        return _jwks_cache["keys"]

    supabase_url = get_settings().supabase_url
    if not supabase_url:
        return []

    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        resp = requests.get(jwks_url, timeout=5)
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
        _jwks_cache["keys"] = keys
        _jwks_cache["fetched_at"] = now
        return keys
    except Exception:
        # If fetch fails but we have stale keys, use them
        if _jwks_cache["keys"]:
            return _jwks_cache["keys"]
        return []


def _parse_bearer(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth scheme")
    return authorization.split(" ", 1)[1].strip()


def _verify_supabase_jwt(token: str) -> dict:
    """Verify a Supabase JWT and return the decoded payload.
    Supports HMAC (HS256/HS384/HS512) and asymmetric (ES256, RS256) algorithms.
    For asymmetric algorithms, the public key is fetched from Supabase's JWKS endpoint."""
    settings = get_settings()

    # Peek at the token header to see what algorithm Supabase used
    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed JWT — could not decode header")

    token_alg = unverified_header.get("alg", "unknown")

    hmac_algs = ["HS256", "HS384", "HS512"]
    asymmetric_algs = ["ES256", "RS256", "RS384", "RS512"]

    if token_alg in hmac_algs:
        # ── HMAC verification using JWT secret ──
        secret = settings.supabase_jwt_secret
        if not secret:
            raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured on backend")
        try:
            return jwt.decode(token, secret, algorithms=hmac_algs, options={"verify_aud": False})
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidSignatureError:
            raise HTTPException(
                status_code=401,
                detail="JWT signature verification failed. Check SUPABASE_JWT_SECRET."
            )
        except jwt.InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    elif token_alg in asymmetric_algs:
        # ── Asymmetric verification using JWKS public key ──
        jwks_keys = _get_jwks_keys()
        if not jwks_keys:
            raise HTTPException(
                status_code=500,
                detail="Cannot verify ES256/RS256 token: SUPABASE_URL not configured or JWKS fetch failed. "
                       "Set SUPABASE_URL in your backend environment."
            )

        # Find the matching key by kid (key ID) if present
        token_kid = unverified_header.get("kid")
        matching_key = None
        for key_data in jwks_keys:
            if token_kid and key_data.get("kid") == token_kid:
                matching_key = key_data
                break
        # If no kid match, use the first key that matches the algorithm
        if not matching_key:
            for key_data in jwks_keys:
                if key_data.get("kty") == ("EC" if token_alg.startswith("ES") else "RSA"):
                    matching_key = key_data
                    break
        if not matching_key:
            raise HTTPException(
                status_code=401,
                detail=f"No matching public key found in JWKS for algorithm '{token_alg}'."
            )

        try:
            from jwt.algorithms import ECAlgorithm, RSAAlgorithm
            if token_alg.startswith("ES"):
                public_key = ECAlgorithm.from_jwk(matching_key)
            else:
                public_key = RSAAlgorithm.from_jwk(matching_key)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to construct public key from JWKS: {exc}")

        try:
            return jwt.decode(token, public_key, algorithms=[token_alg], options={"verify_aud": False})
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidSignatureError:
            raise HTTPException(
                status_code=401,
                detail="JWT signature verification failed against Supabase JWKS public key."
            )
        except jwt.InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    else:
        raise HTTPException(
            status_code=401,
            detail=f"JWT uses unsupported algorithm '{token_alg}'. "
                   f"Expected HMAC (HS256) or ECDSA (ES256) or RSA (RS256)."
        )


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


def provision_user(supabase_uid: str, email: str, org_id: int | None = None) -> tuple[dict, bool]:
    """
    Get or create a local DB user mapped to the given Supabase UID.
    If org_id is provided (invite flow), user joins that org.
    If org_id is None (new signup), user is created without an org — they must
    request a company account which requires Sentinel admin approval.
    Returns (user_dict, is_new_user).
    """
    init_db()
    row = _get_db_user(supabase_uid)
    if row:
        return row, False

    username = email or supabase_uid

    if org_id is not None:
        # Invite flow — join the specified org as employee (or manager if first)
        count_row = fetch_one("SELECT COUNT(*) as cnt FROM users WHERE org_id = ?", (org_id,))
        role = "manager" if (count_row and count_row["cnt"] == 0) else "employee"

        # Try to match this user to an existing employee record by email
        employee_row = fetch_one(
            "SELECT id FROM employees WHERE lower(trim(email)) = ? AND org_id = ?",
            ((email or "").strip().lower(), org_id),
        )
        employee_id = employee_row["id"] if employee_row else None

        execute(
            "INSERT INTO users (supabase_uid, username, password, role, employee_id, org_id, created_at) VALUES (?, ?, '', ?, ?, ?, ?)",
            (supabase_uid, username, role, employee_id, org_id, _utc_now()),
        )

        # Mark the employee record as claimed
        if employee_id:
            execute(
                "UPDATE employees SET account_claimed_at = ? WHERE id = ?",
                (_utc_now(), employee_id),
            )

        # Set owner_user_id on the org if this is the first user (manager)
        if role == "manager":
            user_row = fetch_one("SELECT id FROM users WHERE supabase_uid = ?", (supabase_uid,))
            if user_row:
                execute("UPDATE organizations SET owner_user_id = ? WHERE id = ?", (user_row["id"], org_id))
    else:
        # New signup without invite — create user with no org
        # They'll need to request a company account (requires admin approval)
        execute(
            "INSERT INTO users (supabase_uid, username, password, role, employee_id, org_id, created_at) VALUES (?, ?, '', 'pending', NULL, NULL, ?)",
            (supabase_uid, username, _utc_now()),
        )

    row = _get_db_user(supabase_uid)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to provision user")
    return row, True


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
