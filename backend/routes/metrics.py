from fastapi import APIRouter, Depends

from fastapi import Header
from typing import Optional

from auth import get_current_user, get_current_user_optional, get_org_id, resolve_org_id
from engines.reporting_engine import build_dashboard_metrics, build_metrics, empty_employee_dashboard_metrics
from models import DashboardMetrics, MetricSnapshot

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricSnapshot)
def get_metrics(
    current_user: dict = Depends(get_current_user),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> MetricSnapshot:
    org_id = resolve_org_id(current_user, x_org_id)
    return build_metrics(org_id=org_id)


@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard_metrics(
    current_user: dict | None = Depends(get_current_user_optional),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> DashboardMetrics:
    if current_user:
        org_id = resolve_org_id(current_user, x_org_id)
    else:
        org_id = 1
    if current_user and current_user.get("role") == "employee":
        eid = current_user.get("employee_id")
        if eid is None:
            return empty_employee_dashboard_metrics()
        return build_dashboard_metrics(employee_id=int(eid), org_id=org_id)
    return build_dashboard_metrics(org_id=org_id)
