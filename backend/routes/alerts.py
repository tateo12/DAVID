from typing import Optional

from fastapi import APIRouter, Depends, Header

from auth import get_current_user, get_org_id, resolve_org_id
from database import fetch_rows
from models import AlertRecord

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRecord])
def get_alerts(
    current_user: dict = Depends(get_current_user),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> list[AlertRecord]:
    org_id = resolve_org_id(current_user, x_org_id)
    rows = fetch_rows(
        """
        SELECT id, alert_type, severity, detail, is_active, created_at
        FROM alerts
        WHERE is_active = 1 AND org_id = ?
        ORDER BY id DESC
        """,
        (org_id,),
    )
    return [AlertRecord(**dict(row), is_active=bool(row["is_active"])) for row in rows]
