from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from auth import _parse_bearer, _verify_supabase_jwt, get_current_user, provision_user
from database import fetch_one
from models import AuthUser, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/provision", response_model=LoginResponse)
def provision(
    authorization: str | None = Header(default=None),
    org_id: Optional[int] = Query(default=None, description="Org to join (from invite link)"),
) -> LoginResponse:
    """
    Called by the frontend immediately after Supabase sign-in.
    Verifies the Supabase JWT, creates the local DB user mapping on first call,
    and returns the user's role and employee_id so the frontend can build its session.
    If org_id query param is provided (invite flow), user joins that org.
    Otherwise a new org is auto-created.
    """
    token = _parse_bearer(authorization)
    payload = _verify_supabase_jwt(token)

    supabase_uid = payload.get("sub", "")
    email = payload.get("email", "") or ""
    exp_ts = payload.get("exp")
    expires_at = (
        datetime.fromtimestamp(exp_ts, tz=timezone.utc).isoformat()
        if exp_ts
        else ""
    )

    user, is_new = provision_user(supabase_uid, email, org_id=org_id)

    # Determine onboarding status
    if user.get("org_id"):
        onboarding_status = "dashboard"
    else:
        # Check if they have a pending org request
        pending = fetch_one(
            "SELECT status FROM org_requests WHERE supabase_uid = ? ORDER BY id DESC LIMIT 1",
            (supabase_uid,),
        )
        if pending and pending["status"] == "pending":
            onboarding_status = "pending_approval"
        elif pending and pending["status"] == "denied":
            onboarding_status = "denied"
        else:
            onboarding_status = "setup_org"

    return LoginResponse(
        access_token=token,
        expires_at=expires_at,
        user=AuthUser(**user),
        is_new_user=is_new,
        onboarding_status=onboarding_status,
    )


@router.get("/me", response_model=AuthUser)
def me(current_user: dict = Depends(get_current_user)) -> AuthUser:
    return AuthUser(**current_user)


