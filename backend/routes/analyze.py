from fastapi import APIRouter, BackgroundTasks

from engines.orchestration_queue import dispatch_post_analysis
from engines.orchestrator_factory import get_orchestrator
from models import AnalyzeRequest, AnalyzeResponse

router = APIRouter(prefix="/analyze", tags=["analyze"])


@router.post("", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest, background_tasks: BackgroundTasks) -> AnalyzeResponse:
    result = get_orchestrator().run(payload)
    if payload.persist_prompt and result.prompt_id > 0:
        background_tasks.add_task(dispatch_post_analysis, payload.employee_id, result.prompt_id)
    return result
