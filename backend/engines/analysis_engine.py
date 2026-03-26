from engines.agents.main_orchestrator import MainOrchestrator
from models import AnalyzeRequest, AnalyzeResponse

_ORCHESTRATOR = MainOrchestrator()


def analyze_prompt(payload: AnalyzeRequest) -> AnalyzeResponse:
    return _ORCHESTRATOR.run(payload)
