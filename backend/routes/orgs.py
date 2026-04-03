"""Organization request & approval endpoints."""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth import _parse_bearer, _verify_supabase_jwt, get_current_user
from config import frontend_base_url
from database import _utc_now, execute, fetch_one, fetch_rows
from engines.email_sender import EmailSender, send_employee_invite_email, send_onboard_email

router = APIRouter(prefix="/orgs", tags=["orgs"])

SENTINEL_ADMIN_EMAIL = "sentinelaisecurity@gmail.com"


class OrgRequestBody(BaseModel):
    company_name: str


class OrgRequestResponse(BaseModel):
    id: int
    company_name: str
    status: str
    message: str


class OrgRequestListItem(BaseModel):
    id: int
    company_name: str
    email: str
    status: str
    created_at: str


class CreateOrgWithInviteBody(BaseModel):
    company_name: str
    manager_email: str
    manager_name: str = ""


class GenerateOnboardLinkBody(BaseModel):
    company_hint: str = ""


class SendOnboardEmailBody(BaseModel):
    email: str
    company_hint: str = ""


class OnboardLinkListItem(BaseModel):
    id: int
    token: str
    email: str
    company_hint: str
    used: bool
    created_at: str


# ── Public: submit a company request ─────────────────────────────────────────

@router.post("/request", response_model=OrgRequestResponse)
def request_org(
    body: OrgRequestBody,
    authorization: str | None = Header(default=None),
) -> OrgRequestResponse:
    """
    Submit a request to create a new company/organization.
    Requires a valid Supabase JWT (user must have verified their email first).
    Sends an approval email to the Sentinel admin team.
    """
    if authorization is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = _parse_bearer(authorization)
    payload = _verify_supabase_jwt(token)
    supabase_uid = payload.get("sub", "")
    email = payload.get("email", "") or ""

    if not body.company_name.strip():
        raise HTTPException(status_code=422, detail="Company name is required")

    # Check for existing pending request
    existing = fetch_one(
        "SELECT id, status FROM org_requests WHERE supabase_uid = ? AND status = 'pending'",
        (supabase_uid,),
    )
    if existing:
        return OrgRequestResponse(
            id=existing["id"],
            company_name=body.company_name,
            status="pending",
            message="You already have a pending request. We'll email you when it's approved.",
        )

    now = _utc_now()
    req_id = execute(
        "INSERT INTO org_requests (company_name, email, supabase_uid, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
        (body.company_name.strip(), email, supabase_uid, now, now),
    )

    # Send notification email to Sentinel admins
    _send_admin_notification(req_id, body.company_name.strip(), email)

    return OrgRequestResponse(
        id=req_id,
        company_name=body.company_name.strip(),
        status="pending",
        message="Your request has been submitted. We'll review it and email you when approved.",
    )


# ── Sentinel admin: list & manage requests ────────────────────────────────────

@router.get("/requests", response_model=list[OrgRequestListItem])
def list_org_requests(
    current_user: dict = Depends(get_current_user),
) -> list[OrgRequestListItem]:
    """List all org requests. Only accessible by Sentinel super-admins (admin role)."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = fetch_rows(
        "SELECT id, company_name, email, status, created_at FROM org_requests ORDER BY id DESC"
    )
    return [OrgRequestListItem(**dict(r)) for r in rows]


@router.post("/requests/{request_id}/approve")
def approve_org_request(
    request_id: int,
    secret: str | None = None,
) -> dict:
    """
    Approve a pending org request. Creates the organization, assigns the
    requester as manager, and sends them a confirmation email.
    Accessible via secret token link (from admin email) or by admin user.
    """
    from auth import _create_organization, _slug_from_email

    # Verify access — either via secret token or admin auth
    # For now, use a simple shared secret from the approval link
    _verify_admin_action(secret)

    req = fetch_one("SELECT * FROM org_requests WHERE id = ?", (request_id,))
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        return {"status": req["status"], "message": f"Request already {req['status']}"}

    # Create the organization
    slug = _slug_from_email(req["email"])
    org_id = _create_organization(req["company_name"], slug)

    # Update the user to be manager of this org
    execute(
        "UPDATE users SET role = 'manager', org_id = ? WHERE supabase_uid = ?",
        (org_id, req["supabase_uid"]),
    )

    # Set owner
    user_row = fetch_one("SELECT id FROM users WHERE supabase_uid = ?", (req["supabase_uid"],))
    if user_row:
        execute("UPDATE organizations SET owner_user_id = ? WHERE id = ?", (user_row["id"], org_id))

    # Mark request as approved
    execute(
        "UPDATE org_requests SET status = 'approved', reviewed_by = 'sentinel_admin', updated_at = ? WHERE id = ?",
        (_utc_now(), request_id),
    )

    # Email the user that they're approved
    _send_approval_email(req["email"], req["company_name"])

    return {"status": "approved", "message": f"Organization '{req['company_name']}' created. User notified."}


@router.post("/requests/{request_id}/deny")
def deny_org_request(
    request_id: int,
    secret: str | None = None,
    reason: str = "",
) -> dict:
    """Deny a pending org request."""
    _verify_admin_action(secret)

    req = fetch_one("SELECT * FROM org_requests WHERE id = ?", (request_id,))
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        return {"status": req["status"], "message": f"Request already {req['status']}"}

    execute(
        "UPDATE org_requests SET status = 'denied', deny_reason = ?, reviewed_by = 'sentinel_admin', updated_at = ? WHERE id = ?",
        (reason, _utc_now(), request_id),
    )

    return {"status": "denied", "message": "Request denied."}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _verify_admin_action(secret: str | None) -> None:
    """Verify that the caller is authorized to approve/deny requests.
    Uses a simple shared secret passed as query param from the email link."""
    from config import get_settings
    expected = get_settings().supabase_jwt_secret  # reuse as admin secret for now
    if not secret or secret != expected:
        raise HTTPException(status_code=403, detail="Invalid admin secret")


def _send_admin_notification(request_id: int, company_name: str, requester_email: str) -> None:
    """Email Sentinel admins about a new org request with approve/deny links."""
    from config import get_settings
    settings = get_settings()
    base = settings.openrouter_site_url  # backend URL
    admin_secret = settings.supabase_jwt_secret

    # Use the backend URL for approve/deny links
    api_base = f"https://david-upwx.onrender.com/api"
    approve_url = f"{api_base}/orgs/requests/{request_id}/approve?secret={admin_secret}"
    deny_url = f"{api_base}/orgs/requests/{request_id}/deny?secret={admin_secret}"

    html = f"""
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0a0c10; color: #e0e0e0; padding: 32px;">
        <h2 style="color: #c3f400; margin-bottom: 8px;">New Company Request</h2>
        <p style="color: #999; font-size: 12px; margin-bottom: 24px;">Sentinel AI Security — Admin Review Required</p>
        <table style="width: 100%; font-size: 14px; margin-bottom: 24px;">
            <tr><td style="color: #999; padding: 8px 0;">Company:</td><td style="color: #fff;">{company_name}</td></tr>
            <tr><td style="color: #999; padding: 8px 0;">Email:</td><td style="color: #fff;">{requester_email}</td></tr>
            <tr><td style="color: #999; padding: 8px 0;">Request ID:</td><td style="color: #fff;">#{request_id}</td></tr>
        </table>
        <div style="display: flex; gap: 16px; margin-top: 24px;">
            <a href="{approve_url}" style="display: inline-block; padding: 12px 32px; background: #c3f400; color: #000; text-decoration: none; font-weight: bold; font-size: 14px;">APPROVE</a>
            <a href="{deny_url}" style="display: inline-block; padding: 12px 32px; background: #333; color: #fff; text-decoration: none; font-weight: bold; font-size: 14px; margin-left: 16px;">DENY</a>
        </div>
        <p style="color: #666; font-size: 10px; margin-top: 32px;">Clicking approve will create the organization and notify the user.</p>
    </div>
    """

    try:
        sender = EmailSender()
        sender.send_email(SENTINEL_ADMIN_EMAIL, f"[Sentinel] New Company Request: {company_name}", html)
    except Exception:
        pass  # Don't fail the request if email fails


# ── Admin: generate onboard link for B2B sales ──────────────────────────────

@router.post("/generate-onboard-link")
def generate_onboard_link(
    body: GenerateOnboardLinkBody,
    secret: str | None = None,
) -> dict:
    """
    Admin-only. Generates a one-time onboard link to send to a new B2B customer.
    The customer clicks the link, fills out company info, creates their manager
    account, and is immediately logged in.
    """
    _verify_admin_action(secret)

    token = secrets.token_urlsafe(32)
    now = _utc_now()
    execute(
        "INSERT INTO onboard_tokens (token, company_hint, created_at) VALUES (?, ?, ?)",
        (token, body.company_hint.strip() or None, now),
    )

    base = frontend_base_url().rstrip("/")
    onboard_url = f"{base}/onboard?token={token}"

    return {
        "token": token,
        "onboard_url": onboard_url,
        "message": "Send this link to the new customer.",
    }


# ── Admin: create org + first manager invite in one step ─────────────────────

@router.post("/create-with-invite")
def create_org_with_invite(
    body: CreateOrgWithInviteBody,
    secret: str | None = None,
) -> dict:
    """
    Admin-only. Creates a new organization and sends an invite to the first
    manager. This is how Sentinel gives access to a new company:
    company emails us → we verify → call this endpoint → they get an invite.
    """
    _verify_admin_action(secret)

    from auth import _create_organization, _slug_from_email

    company = body.company_name.strip()
    email = body.manager_email.strip().lower()
    name = body.manager_name.strip() or email.split("@")[0]

    if not company:
        raise HTTPException(status_code=422, detail="Company name is required")
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Valid manager email is required")

    # Check for existing org with same name
    if fetch_one("SELECT id FROM organizations WHERE lower(name) = ?", (company.lower(),)):
        raise HTTPException(status_code=400, detail="An organization with this name already exists")

    # Create org
    slug = _slug_from_email(email)
    org_id = _create_organization(company, slug)

    # Create employee record with invite token
    from database import ensure_employee_skill_profile

    eid_row = fetch_one("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM employees")
    eid = int(eid_row["n"] if eid_row else 1)
    token = secrets.token_urlsafe(32)
    now = _utc_now()

    execute(
        """INSERT INTO employees (
            id, name, department, role, risk_score, email, invite_token, invite_sent_at,
            invite_reminder_sent_at, account_claimed_at, extension_first_seen_at, org_id
        ) VALUES (?, ?, 'Management', 'manager', 0, ?, ?, ?, NULL, NULL, NULL, ?)""",
        (eid, name, email, token, now, org_id),
    )
    ensure_employee_skill_profile(eid)

    # Send invite email
    base = frontend_base_url().rstrip("/")
    invite_url = f"{base}/setup-account?token={token}"
    send_employee_invite_email(email, invite_url, name, reminder=False)

    return {
        "status": "created",
        "org_id": org_id,
        "employee_id": eid,
        "invite_url": invite_url,
        "message": f"Organization '{company}' created. Invite sent to {email}.",
    }


# ── Admin (authenticated): send onboard email + list sent links ──────────────

def _require_admin(current_user: dict) -> None:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/send-onboard-email")
def send_onboard_email_endpoint(
    body: SendOnboardEmailBody,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Admin-only (authenticated). Type an email, click send — the customer gets
    an email with a one-time onboard link to create their company account.
    """
    _require_admin(current_user)

    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Valid email is required")

    token = secrets.token_urlsafe(32)
    now = _utc_now()
    execute(
        "INSERT INTO onboard_tokens (token, email, company_hint, created_at) VALUES (?, ?, ?, ?)",
        (token, email, body.company_hint.strip() or None, now),
    )

    base = frontend_base_url().rstrip("/")
    onboard_url = f"{base}/onboard?token={token}"
    send_onboard_email(email, onboard_url, body.company_hint.strip())

    return {
        "status": "sent",
        "email": email,
        "onboard_url": onboard_url,
        "message": f"Onboard email sent to {email}.",
    }


@router.get("/onboard-links", response_model=list[OnboardLinkListItem])
def list_onboard_links(
    current_user: dict = Depends(get_current_user),
) -> list[OnboardLinkListItem]:
    """Admin-only. List all generated onboard links and their status."""
    _require_admin(current_user)

    rows = fetch_rows(
        "SELECT id, token, email, COALESCE(company_hint, '') AS company_hint, used_at, created_at FROM onboard_tokens ORDER BY id DESC"
    )
    return [
        OnboardLinkListItem(
            id=r["id"],
            token=r["token"],
            email=r["email"],
            company_hint=r["company_hint"],
            used=r["used_at"] is not None,
            created_at=r["created_at"],
        )
        for r in rows
    ]


def _send_approval_email(to_email: str, company_name: str) -> None:
    """Notify the user that their company request was approved."""
    base_url = frontend_base_url()
    html = f"""
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0a0c10; color: #e0e0e0; padding: 32px;">
        <h2 style="color: #c3f400; margin-bottom: 8px;">You're Approved!</h2>
        <p style="color: #999; font-size: 12px; margin-bottom: 24px;">Sentinel AI Security</p>
        <p style="font-size: 14px; line-height: 1.6;">
            Your company <strong style="color: #fff;">{company_name}</strong> has been approved on Sentinel.
            You are now the manager of your organization.
        </p>
        <p style="font-size: 14px; line-height: 1.6; margin-top: 16px;">
            Log in to start inviting your team and configuring AI security policies.
        </p>
        <a href="{base_url}/login" style="display: inline-block; margin-top: 24px; padding: 12px 32px; background: #c3f400; color: #000; text-decoration: none; font-weight: bold; font-size: 14px;">LOG IN TO SENTINEL</a>
    </div>
    """
    try:
        sender = EmailSender()
        sender.send_email(to_email, f"[Sentinel] Your company '{company_name}' is approved!", html)
    except Exception:
        pass
