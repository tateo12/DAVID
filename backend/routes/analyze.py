from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from auth import get_current_user
from engines.orchestration_queue import dispatch_post_analysis
from engines.orchestrator_factory import get_orchestrator
from models import AnalyzeRequest, AnalyzeResponse

router = APIRouter(prefix="/analyze", tags=["analyze"])


@router.post("", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)) -> AnalyzeResponse:
    # Employees can only analyze their own prompts.
    if current_user.get("role") == "employee":
        own_eid = current_user.get("employee_id")
        if payload.employee_id != own_eid:
            raise HTTPException(status_code=403, detail="Employees may only analyze their own prompts")
    result = get_orchestrator().run(payload)
    if payload.persist_prompt and result.prompt_id > 0:
        background_tasks.add_task(dispatch_post_analysis, payload.employee_id, result.prompt_id)
    return result
