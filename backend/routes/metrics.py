from fastapi import APIRouter

from engines.reporting_engine import build_dashboard_metrics, build_metrics
from models import DashboardMetrics, MetricSnapshot

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricSnapshot)
def get_metrics() -> MetricSnapshot:
    return build_metrics()


@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard_metrics() -> DashboardMetrics:
    return build_dashboard_metrics()
