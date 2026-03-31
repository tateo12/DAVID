import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException

from auth import create_session, get_current_user, hash_password
from database import _utc_now, execute, fetch_one, init_db
from models import AuthUser, InviteRegisterRequest, LoginRequest, LoginResponse, OtpRegisterRequest, OtpVerifyRequest
from engines.email_sender import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register-request")
def register_request(payload: OtpRegisterRequest):
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
def register_verify(payload: OtpVerifyRequest) -> LoginResponse:
    init_db()
    email = payload.email.strip().lower()
    code = payload.code.strip()
    username = payload.username.strip()
    password = payload.password
    
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
def login(payload: LoginRequest) -> LoginResponse:
    session = create_session(payload.username, payload.password)
    return LoginResponse(
        access_token=session["access_token"],
        expires_at=session["expires_at"],
        user=AuthUser(**session["user"]),
    )


@router.post("/register-invite", response_model=LoginResponse)
def register_invite(payload: InviteRegisterRequest) -> LoginResponse:
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
    if len(username) < 2 or len(password) < 4:
        raise HTTPException(status_code=400, detail="Username and password are required (password min 4 chars)")
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


@router.get("/me", response_model=AuthUser)
def me(current_user: dict = Depends(get_current_user)) -> AuthUser:
    return AuthUser(**current_user)
