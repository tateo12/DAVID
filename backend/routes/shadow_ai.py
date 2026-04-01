from fastapi import APIRouter, Depends

from auth import get_current_user, get_current_user_optional
from engines.reporting_engine import list_shadow_ai
from models import ShadowAIEvent

router = APIRouter(prefix="/shadow-ai", tags=["shadow-ai"])


@router.get("", response_model=list[ShadowAIEvent])
def get_shadow_ai(current_user: dict = Depends(get_current_user)) -> list[ShadowAIEvent]:
    eid = None
    if current_user.get("role") == "employee" and current_user.get("employee_id") is not None:
        eid = int(current_user["employee_id"])
    rows = list_shadow_ai(employee_id=eid)
    return [ShadowAIEvent(**row) for row in rows]
