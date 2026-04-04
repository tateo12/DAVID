from typing import Optional

from fastapi import APIRouter, Depends, Header

from auth import get_current_user, get_org_id, resolve_org_id
from engines.reporting_engine import list_shadow_ai
from models import ShadowAIEvent

router = APIRouter(prefix="/shadow-ai", tags=["shadow-ai"])


@router.get("", response_model=list[ShadowAIEvent])
def get_shadow_ai(
    current_user: dict = Depends(get_current_user),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> list[ShadowAIEvent]:
    org_id = resolve_org_id(current_user, x_org_id)
    eid = None
    if current_user.get("role") == "employee" and current_user.get("employee_id") is not None:
        eid = int(current_user["employee_id"])
    rows = list_shadow_ai(employee_id=eid, org_id=org_id)
    return [ShadowAIEvent(**row) for row in rows]
