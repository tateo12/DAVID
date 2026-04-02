from fastapi import APIRouter, Depends

from auth import get_current_user, get_current_user_optional, get_org_id
from engines.reporting_engine import build_dashboard_metrics, build_metrics, empty_employee_dashboard_metrics
from models import DashboardMetrics, MetricSnapshot

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricSnapshot)
def get_metrics(current_user: dict = Depends(get_current_user)) -> MetricSnapshot:
    org_id = get_org_id(current_user)
    return build_metrics(org_id=org_id)


@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard_metrics(current_user: dict | None = Depends(get_current_user_optional)) -> DashboardMetrics:
    org_id = get_org_id(current_user) if current_user else 1
    if current_user and current_user.get("role") == "employee":
        eid = current_user.get("employee_id")
        if eid is None:
            return empty_employee_dashboard_metrics()
        return build_dashboard_metrics(employee_id=int(eid), org_id=org_id)
    return build_dashboard_metrics(org_id=org_id)
