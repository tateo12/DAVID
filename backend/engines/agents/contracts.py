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


@dataclass(slots=True)
class OrchestrationSynthesis:
    detections: list[Detection]
    risk_level: RiskLevel
    action: ActionType
    layer_used: DetectionLayer
    confidence: float
