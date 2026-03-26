from fastapi import APIRouter

from engines.reporting_engine import list_shadow_ai
from models import ShadowAIEvent

router = APIRouter(prefix="/shadow-ai", tags=["shadow-ai"])


@router.get("", response_model=list[ShadowAIEvent])
def get_shadow_ai() -> list[ShadowAIEvent]:
    rows = list_shadow_ai()
    return [ShadowAIEvent(**row) for row in rows]
