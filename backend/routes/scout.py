from fastapi import APIRouter

from engines.scout_engine import (
    _openrouter_key,
    format_telemetry_digest,
    gather_prompt_telemetry,
    run_scout_chat,
)
from models import ScoutChatRequest, ScoutChatResponse, ScoutTelemetryResponse

router = APIRouter(prefix="/scout", tags=["scout"])


@router.get("/telemetry", response_model=ScoutTelemetryResponse)
def get_scout_telemetry() -> ScoutTelemetryResponse:
    data = gather_prompt_telemetry()
    return ScoutTelemetryResponse(
        total_prompts=int(data["total_prompts"]),
        digest=format_telemetry_digest(data),
        llm_available=bool(_openrouter_key()),
    )


@router.post("/chat", response_model=ScoutChatResponse)
def scout_chat(payload: ScoutChatRequest) -> ScoutChatResponse:
    raw = [{"role": m.role, "content": m.content} for m in payload.messages]
    text, used = run_scout_chat(raw)
    return ScoutChatResponse(message=text, used_llm=used)
