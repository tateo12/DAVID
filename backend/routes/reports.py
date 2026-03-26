from fastapi import APIRouter

from engines.reporting_engine import latest_weekly_report
from models import WeeklyReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/weekly", response_model=WeeklyReportResponse)
def weekly_report() -> WeeklyReportResponse:
    return latest_weekly_report()
