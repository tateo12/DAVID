from datetime import datetime, timezone
from typing import Optional

import requests as http_requests

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from auth import _parse_bearer, _verify_supabase_jwt, get_current_user, provision_user
from config import get_settings
from database import _utc_now, execute, fetch_one
from models import AuthUser, InviteInfoResponse, LoginResponse, OnboardInfoResponse, OnboardRequest, SendCodeRequest, SendCodeResponse, SetupAccountRequest, UpdateProfileRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config")
def auth_config():
    """Public endpoint returning Supabase URL and anon key for desktop/extension clients."""
    settings = get_settings()
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
    }


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


# ── Update profile ─────────────────────────────────────────────────────────

@router.patch("/me", response_model=AuthUser)
def update_profile(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
) -> AuthUser:
    """Update the current user's profile (username, password)."""
    settings = get_settings()
    updated = False

    if body.username is not None:
        name = body.username.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Username cannot be empty")
        execute("UPDATE users SET username = ? WHERE id = ?", (name, current_user["id"]))
        updated = True

    if body.new_password is not None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        # Look up the Supabase UID for this user
        user_row = fetch_one("SELECT supabase_uid FROM users WHERE id = ?", (current_user["id"],))
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        supabase_url = settings.supabase_url.rstrip("/")
        update_resp = http_requests.put(
            f"{supabase_url}/auth/v1/admin/users/{user_row['supabase_uid']}",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
                "Content-Type": "application/json",
            },
            json={"password": body.new_password},
            timeout=10,
        )
        if not update_resp.ok:
            raise HTTPException(status_code=500, detail="Failed to update password")
        updated = True

    if not updated:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Return refreshed user
    user_row = fetch_one(
        """SELECT u.id, u.username, u.role, u.employee_id, u.org_id,
                  COALESCE(o.name, '') AS org_name
           FROM users u
           LEFT JOIN organizations o ON o.id = u.org_id
           WHERE u.id = ?""",
        (current_user["id"],),
    )
    return AuthUser(**dict(user_row))


# ── Email verification codes ────────────────────────────────────────────────

def _generate_code() -> str:
    """Generate a 6-digit verification code."""
    import random
    return str(random.randint(100000, 999999))


def _send_verification_email(to_email: str, code: str) -> None:
    """Send a verification code email via Resend."""
    from engines.email_sender import EmailSender
    sender = EmailSender()
    html = f"""
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0a0c10; color: #e0e0e0; padding: 32px;">
        <div style="margin-bottom: 24px;">
            <h1 style="color: #c3f400; margin: 0; font-size: 20px; letter-spacing: -0.5px;">SENTINEL</h1>
        </div>
        <h2 style="color: #fff; font-size: 18px; margin-bottom: 8px;">Your verification code</h2>
        <p style="color: #999; font-size: 14px; margin-bottom: 24px;">Enter this code to verify your email address:</p>
        <div style="background: #111; border: 1px solid #333; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; letter-spacing: 8px; color: #c3f400; font-weight: bold;">{code}</span>
        </div>
        <p style="color: #666; font-size: 12px;">This code expires in 10 minutes. If you didn&rsquo;t request this, ignore this email.</p>
    </div>
    """
    sender.send_email(to_email, f"Sentinel: Your verification code is {code}", html)


def _verify_code(email: str, code: str) -> bool:
    """Check if a valid, unexpired verification code exists for this email."""
    row = fetch_one(
        "SELECT id FROM verification_codes WHERE email = ? AND code = ? AND verified = 0 AND expires_at > ?",
        (email.strip().lower(), code.strip(), _utc_now()),
    )
    if row:
        execute("UPDATE verification_codes SET verified = 1 WHERE id = ?", (row["id"],))
        return True
    return False


@router.post("/send-code", response_model=SendCodeResponse)
def send_code(body: SendCodeRequest) -> SendCodeResponse:
    """
    Public endpoint. Sends a 6-digit verification code to the given email.
    Code is valid for 10 minutes. Used during account setup and onboarding.
    """
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Valid email is required")

    code = _generate_code()
    now = _utc_now()
    # Expires in 10 minutes
    from datetime import timedelta
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

    execute(
        "INSERT INTO verification_codes (email, code, verified, expires_at, created_at) VALUES (?, ?, 0, ?, ?)",
        (email, code, expires, now),
    )

    _send_verification_email(email, code)

    return SendCodeResponse(message="Verification code sent. Check your email.")


# ── Invite-based account setup (no Supabase until password is set) ───────────


@router.get("/invite-info", response_model=InviteInfoResponse)
def invite_info(token: str = Query(..., description="Invite token from email link")) -> InviteInfoResponse:
    """
    Public endpoint. Returns the employee name and email for a valid invite token
    so the setup-account page can pre-fill the username field.
    """
    row = fetch_one(
        """SELECT e.email, e.name, COALESCE(o.name, '') AS org_name
           FROM employees e
           LEFT JOIN organizations o ON o.id = e.org_id
           WHERE e.invite_token = ? AND e.account_claimed_at IS NULL""",
        (token,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
    return InviteInfoResponse(email=row["email"], name=row["name"], org_name=row["org_name"])


@router.post("/setup-account", response_model=LoginResponse)
def setup_account(body: SetupAccountRequest) -> LoginResponse:
    """
    Public endpoint. Final step of the invite flow.
    1. Validates the invite token
    2. Creates a Supabase auth user with the given password (via Admin API)
    3. Signs the user in to get a JWT
    4. Provisions the local DB user (links to employee + org)
    5. Returns a ready-to-use session

    No Supabase user exists until this endpoint is called.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key or not settings.supabase_anon_key:
        raise HTTPException(status_code=500, detail="Supabase auth not configured on backend")

    # 1. Validate invite token
    emp = fetch_one(
        "SELECT id, email, name, org_id FROM employees WHERE invite_token = ? AND account_claimed_at IS NULL",
        (body.token,),
    )
    if not emp:
        raise HTTPException(status_code=400, detail="Invalid or already-used invite link")

    email = emp["email"]

    # 1b. Verify the email verification code
    if not _verify_code(email, body.verification_code):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    org_id = emp["org_id"]
    supabase_url = settings.supabase_url.rstrip("/")

    # 2. Create Supabase user via Admin API (email auto-confirmed since invite is the verification)
    create_resp = http_requests.post(
        f"{supabase_url}/auth/v1/admin/users",
        headers={
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": "application/json",
        },
        json={
            "email": email,
            "password": body.password,
            "email_confirm": True,
        },
        timeout=10,
    )
    if create_resp.status_code == 422:
        # User already exists in Supabase (e.g. from a previous OTP attempt) — update their password instead
        existing = create_resp.json()
        # Try to find existing user and update password
        list_resp = http_requests.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            params={"filter": f"email eq {email}"},
            timeout=10,
        )
        if list_resp.ok:
            users = list_resp.json().get("users", [])
            matched = [u for u in users if u.get("email", "").lower() == email.lower()]
            if matched:
                uid = matched[0]["id"]
                update_resp = http_requests.put(
                    f"{supabase_url}/auth/v1/admin/users/{uid}",
                    headers={
                        "Authorization": f"Bearer {settings.supabase_service_role_key}",
                        "apikey": settings.supabase_service_role_key,
                        "Content-Type": "application/json",
                    },
                    json={"password": body.password, "email_confirm": True},
                    timeout=10,
                )
                if not update_resp.ok:
                    raise HTTPException(status_code=500, detail="Failed to update existing Supabase user")
            else:
                raise HTTPException(status_code=500, detail="Supabase user conflict — contact support")
        else:
            raise HTTPException(status_code=500, detail="Failed to resolve existing Supabase user")
    elif not create_resp.ok:
        detail = create_resp.json().get("msg", create_resp.text)
        raise HTTPException(status_code=500, detail=f"Failed to create auth account: {detail}")

    # 3. Sign in to get a JWT
    signin_resp = http_requests.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={
            "apikey": settings.supabase_anon_key,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": body.password},
        timeout=10,
    )
    if not signin_resp.ok:
        raise HTTPException(status_code=500, detail="Account created but sign-in failed — try logging in manually")

    signin_data = signin_resp.json()
    access_token = signin_data["access_token"]
    supabase_uid = signin_data["user"]["id"]
    exp_ts = signin_data.get("expires_at")
    expires_at = ""
    if exp_ts:
        try:
            expires_at = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc).isoformat()
        except (ValueError, TypeError):
            expires_at = str(exp_ts)

    # 4. Provision local user (links to employee + org)
    user, _ = provision_user(supabase_uid, email, org_id=org_id)

    # 5. Mark invite as claimed
    execute(
        "UPDATE employees SET account_claimed_at = ? WHERE id = ?",
        (_utc_now(), emp["id"]),
    )

    return LoginResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=AuthUser(**user),
        is_new_user=True,
        onboarding_status="dashboard",
    )


# ── Company onboarding (B2B sales link → create org + manager account) ───────


@router.get("/onboard-info", response_model=OnboardInfoResponse)
def onboard_info(token: str = Query(..., description="Onboard token from sales link")) -> OnboardInfoResponse:
    """
    Public endpoint. Validates an onboard token and returns any hint
    (e.g. pre-filled company name) so the onboarding page can render.
    """
    row = fetch_one(
        "SELECT company_hint FROM onboard_tokens WHERE token = ? AND used_at IS NULL",
        (token,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Invalid or expired onboard link")
    return OnboardInfoResponse(valid=True, company_hint=row["company_hint"] or "")


@router.post("/onboard", response_model=LoginResponse)
def onboard(body: OnboardRequest) -> LoginResponse:
    """
    Public endpoint. The B2B onboarding flow:
    1. Validates the one-time onboard token
    2. Creates the organization
    3. Creates a Supabase auth user with the given password
    4. Signs the user in to get a JWT
    5. Provisions the local DB user as manager of the new org
    6. Returns a ready-to-use session
    """
    from auth import _create_organization, _slug_from_email

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key or not settings.supabase_anon_key:
        raise HTTPException(status_code=500, detail="Supabase auth not configured on backend")

    # 1. Validate onboard token
    tok_row = fetch_one(
        "SELECT id FROM onboard_tokens WHERE token = ? AND used_at IS NULL",
        (body.token,),
    )
    if not tok_row:
        raise HTTPException(status_code=400, detail="Invalid or already-used onboard link")

    email = body.email.strip().lower()
    company = body.company_name.strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Valid email is required")

    # 1b. Verify the email verification code
    if not _verify_code(email, body.verification_code):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    supabase_url = settings.supabase_url.rstrip("/")

    # 2. Create the organization
    slug = _slug_from_email(email)
    org_id = _create_organization(company, slug)

    # 3. Create Supabase user via Admin API
    create_resp = http_requests.post(
        f"{supabase_url}/auth/v1/admin/users",
        headers={
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": "application/json",
        },
        json={
            "email": email,
            "password": body.password,
            "email_confirm": True,
        },
        timeout=10,
    )
    if create_resp.status_code == 422:
        # User already exists — update password
        list_resp = http_requests.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            params={"filter": f"email eq {email}"},
            timeout=10,
        )
        if list_resp.ok:
            users = list_resp.json().get("users", [])
            matched = [u for u in users if u.get("email", "").lower() == email.lower()]
            if matched:
                uid = matched[0]["id"]
                update_resp = http_requests.put(
                    f"{supabase_url}/auth/v1/admin/users/{uid}",
                    headers={
                        "Authorization": f"Bearer {settings.supabase_service_role_key}",
                        "apikey": settings.supabase_service_role_key,
                        "Content-Type": "application/json",
                    },
                    json={"password": body.password, "email_confirm": True},
                    timeout=10,
                )
                if not update_resp.ok:
                    raise HTTPException(status_code=500, detail="Failed to update existing Supabase user")
            else:
                raise HTTPException(status_code=500, detail="Supabase user conflict — contact support")
        else:
            raise HTTPException(status_code=500, detail="Failed to resolve existing Supabase user")
    elif not create_resp.ok:
        detail = create_resp.json().get("msg", create_resp.text)
        raise HTTPException(status_code=500, detail=f"Failed to create auth account: {detail}")

    # 4. Sign in to get a JWT
    signin_resp = http_requests.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={
            "apikey": settings.supabase_anon_key,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": body.password},
        timeout=10,
    )
    if not signin_resp.ok:
        raise HTTPException(status_code=500, detail="Account created but sign-in failed — try logging in manually")

    signin_data = signin_resp.json()
    access_token = signin_data["access_token"]
    supabase_uid = signin_data["user"]["id"]
    exp_ts = signin_data.get("expires_at")
    expires_at = ""
    if exp_ts:
        try:
            expires_at = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc).isoformat()
        except (ValueError, TypeError):
            expires_at = str(exp_ts)

    # 5. Provision local user as manager of the new org
    user, _ = provision_user(supabase_uid, email, org_id=org_id)

    # 6. Mark onboard token as used and store the actual company name
    execute(
        "UPDATE onboard_tokens SET used_at = ?, company_hint = ? WHERE token = ?",
        (_utc_now(), company, body.token),
    )

    return LoginResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=AuthUser(**user),
        is_new_user=True,
        onboarding_status="dashboard",
    )


