from dataclasses import dataclass, field

from models import ActionType, Detection, RiskLevel


@dataclass(slots=True)
class L2ClassificationResult:
    applied: bool
    additional_detections: list[Detection] = field(default_factory=list)
    risk_adjustment: str | None = None
    rationale: str | None = None
    estimated_cost_usd: float = 0.0
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class L3JudgmentResult:
    applied: bool
    risk_level: RiskLevel | None = None
    action: ActionType | None = None
    confidence: float | None = None
    rationale: str | None = None
    estimated_cost_usd: float = 0.0
    warnings: list[str] = field(default_factory=list)
