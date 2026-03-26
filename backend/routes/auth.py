from fastapi import APIRouter, Depends

from auth import create_session, get_current_user
from models import AuthUser, LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    session = create_session(payload.username, payload.password)
    return LoginResponse(
        access_token=session["access_token"],
        expires_at=session["expires_at"],
        user=AuthUser(**session["user"]),
    )


@router.get("/me", response_model=AuthUser)
def me(current_user: dict = Depends(get_current_user)) -> AuthUser:
    return AuthUser(**current_user)
