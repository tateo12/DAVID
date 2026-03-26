from dataclasses import dataclass, field
from typing import Any

from models import ActionType, Detection, DetectionLayer, PromptSkillEvaluation, RiskLevel


@dataclass(slots=True)
class PolicyEnforcementResult:
    detections: list[Detection]
    employee_role: str


@dataclass(slots=True)
class EmployeeSupervisionResult:
    detections: list[Detection]
    tool_domain: str | None
    security_exam: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class CoachingResult:
    skill: PromptSkillEvaluation
    tip: str | None
    redacted_prompt: str | None


@dataclass(slots=True)
class BudgetProfitabilityResult:
    estimated_cost_usd: float
    review: dict[str, Any]
    security_flags: list[dict[str, Any]] = field(default_factory=list)
    agents_at_risk: list[str] = field(default_factory=list)


@dataclass(slots=True)
class OrchestrationSynthesis:
    detections: list[Detection]
    risk_level: RiskLevel
    action: ActionType
    layer_used: DetectionLayer
    confidence: float


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
