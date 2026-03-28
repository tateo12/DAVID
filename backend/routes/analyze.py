from fastapi import APIRouter

from engines.orchestrator_factory import get_orchestrator
from models import AnalyzeRequest, AnalyzeResponse

router = APIRouter(prefix="/analyze", tags=["analyze"])


@router.post("", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    return get_orchestrator().run(payload)
