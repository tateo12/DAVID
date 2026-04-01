from fastapi import APIRouter, Depends

from auth import get_current_user, get_current_user_optional
from engines.reporting_engine import build_dashboard_metrics, build_metrics, empty_employee_dashboard_metrics
from models import DashboardMetrics, MetricSnapshot

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricSnapshot)
def get_metrics(_current_user: dict = Depends(get_current_user)) -> MetricSnapshot:
    return build_metrics()


@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard_metrics(current_user: dict | None = Depends(get_current_user_optional)) -> DashboardMetrics:
    if current_user and current_user.get("role") == "employee":
        eid = current_user.get("employee_id")
        if eid is None:
            return empty_employee_dashboard_metrics()
        return build_dashboard_metrics(employee_id=int(eid))
    return build_dashboard_metrics()
