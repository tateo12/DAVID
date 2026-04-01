import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import create_session, get_current_user, hash_password, refresh_session
from database import _utc_now, execute, fetch_one, init_db
from rate_limit import limiter
from models import AuthUser, InviteRegisterRequest, LoginRequest, LoginResponse, OtpRegisterRequest, OtpVerifyRequest
from engines.email_sender import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register-request")
@limiter.limit("5/minute")
def register_request(request: Request, payload: OtpRegisterRequest):
    init_db()
    email = payload.email.strip().lower()
    company = payload.company_name.strip()
    role = payload.role.strip()
    
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if fetch_one("SELECT id FROM employees WHERE lower(trim(email)) = ?", (email,)):
        raise HTTPException(status_code=400, detail="Email already registered")
        
    code = f"{secrets.randbelow(1000000):06d}"
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    now = _utc_now()
    execute(
        "INSERT INTO auth_otps (email, code, role, company_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        (email, code, role, company, now, expires)
    )
    send_otp_email(email, code, role)
    return {"status": "otp_sent"}


@router.post("/register-verify", response_model=LoginResponse)
@limiter.limit("10/minute")
def register_verify(request: Request, payload: OtpVerifyRequest) -> LoginResponse:
    init_db()
    email = payload.email.strip().lower()
    code = payload.code.strip()
    username = payload.username.strip()
    password = payload.password
    
    if len(username) < 2 or len(password) < 12:
        raise HTTPException(status_code=400, detail="Username (min 2 chars) and password (min 12 chars) are required")
    if fetch_one("SELECT id FROM users WHERE username = ?", (username,)):
        raise HTTPException(status_code=400, detail="Username already taken")

    now = _utc_now()
    otp_row = fetch_one(
        "SELECT id, role, company_name FROM auth_otps WHERE email = ? AND code = ? AND expires_at > ? ORDER BY id DESC LIMIT 1",
        (email, code, now)
    )
    if not otp_row:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
        
    from routes.employees import _next_employee_id
    from database import ensure_employee_skill_profile
    eid = _next_employee_id()
    name = email.split("@")[0]
    
    execute(
        """
        INSERT INTO employees (
            id, name, department, role, risk_score, email, company_name, account_claimed_at
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (eid, name, "General", otp_row["role"], email, otp_row["company_name"], now)
    )
    ensure_employee_skill_profile(eid)
    
    execute(
        "INSERT INTO users (username, password, role, employee_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (username, hash_password(password), otp_row["role"], eid, now)
    )
    
    session = create_session(username, password)
    return LoginResponse(
        access_token=session["access_token"],
        expires_at=session["expires_at"],
        user=AuthUser(**session["user"]),
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest) -> LoginResponse:
    session = create_session(payload.username, payload.password)
    return LoginResponse(
        access_token=session["access_token"],
        expires_at=session["expires_at"],
        user=AuthUser(**session["user"]),
    )


@router.post("/register-invite", response_model=LoginResponse)
@limiter.limit("10/minute")
def register_invite(request: Request, payload: InviteRegisterRequest) -> LoginResponse:
    init_db()
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Missing invite token")
    row = fetch_one(
        """
        SELECT id, name, email, invite_token, account_claimed_at
        FROM employees WHERE invite_token = ?
        """,
        (token,),
    )
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")
    if row["account_claimed_at"]:
        raise HTTPException(status_code=400, detail="This invite was already used")
    username = (payload.username or "").strip()
    password = payload.password or ""
    if len(username) < 2 or len(password) < 12:
        raise HTTPException(status_code=400, detail="Username (min 2 chars) and password (min 12 chars) are required")
    if fetch_one("SELECT id FROM users WHERE username = ?", (username,)):
        raise HTTPException(status_code=400, detail="Username already taken")
    display = (payload.display_name or "").strip() or (username.split("@")[0] if "@" in username else username)
    execute(
        "INSERT INTO users (username, password, role, employee_id, created_at) VALUES (?, ?, 'employee', ?, ?)",
        (username, hash_password(password), int(row["id"]), _utc_now()),
    )
    execute(
        """
        UPDATE employees
        SET name = ?, account_claimed_at = ?, invite_token = NULL
        WHERE id = ?
        """,
        (display, _utc_now(), int(row["id"])),
    )
    session = create_session(username, password)
    return LoginResponse(
        access_token=session["access_token"],
        expires_at=session["expires_at"],
        user=AuthUser(**session["user"]),
    )


@router.post("/refresh-token", response_model=LoginResponse)
def refresh_token(request: Request) -> LoginResponse:
    """Extend an active session without re-authenticating. Call when expires_at is within 15 minutes."""
    token_header = request.headers.get("authorization") or ""
    if not token_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = token_header.split(" ", 1)[1].strip()
    session = refresh_session(token)
    return LoginResponse(
        access_token=session["access_token"],
        expires_at=session["expires_at"],
        user=AuthUser(**session["user"]),
    )


@router.get("/me", response_model=AuthUser)
def me(current_user: dict = Depends(get_current_user)) -> AuthUser:
    return AuthUser(**current_user)
