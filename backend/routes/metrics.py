from fastapi import APIRouter

from engines.reporting_engine import build_metrics
from models import MetricSnapshot

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricSnapshot)
def get_metrics() -> MetricSnapshot:
    return build_metrics()
