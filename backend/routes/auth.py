from fastapi import APIRouter, Depends, HTTPException

from auth import create_session, get_current_user, hash_password
from database import _utc_now, execute, fetch_one, init_db
from models import AuthUser, InviteRegisterRequest, LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


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
