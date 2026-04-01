from fastapi import APIRouter, Depends

from auth import get_current_user
from database import fetch_rows
from models import AlertRecord

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRecord])
def get_alerts(_current_user: dict = Depends(get_current_user)) -> list[AlertRecord]:
    rows = fetch_rows(
        """
        SELECT id, alert_type, severity, detail, is_active, created_at
        FROM alerts
        WHERE is_active = 1
        ORDER BY id DESC
        """
    )
    return [AlertRecord(**dict(row), is_active=bool(row["is_active"])) for row in rows]
