from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator

MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_EXTRACTED_TEXT_CHARS = 12000


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ActionType(str, Enum):
    allow = "allow"
    block = "block"
    redact = "redact"
    quarantine = "quarantine"


class DetectionLayer(str, Enum):
    l1 = "L1_regex"
    l2 = "L2_classifier"
    l3 = "L3_llm"


class DetectionType(str, Enum):
    pii = "pii"
    secret = "secret"
    policy = "policy"
    shadow_ai = "shadow_ai"


class Detection(BaseModel):
    type: DetectionType
    subtype: str
    severity: RiskLevel
    detail: str
    span: tuple[int, int]
    confidence: float = Field(ge=0.0, le=1.0)
    layer: DetectionLayer
    source: str | None = None


class AttachmentContext(BaseModel):
    filename: str
    mime_type: str
    size_bytes: int = Field(ge=0)
    extracted_text: str = ""
    source: str | None = None
    extraction_status: str | None = None
    last_modified_ms: int | None = None

    @field_validator("mime_type")
    @classmethod
    def validate_mime_type(cls, value: str) -> str:
        if "/" not in value:
            raise ValueError("mime_type must be a valid MIME value like type/subtype")
        return value

    @field_validator("size_bytes")
    @classmethod
    def validate_size_bytes(cls, value: int) -> int:
        if value > MAX_ATTACHMENT_BYTES:
            raise ValueError(f"attachment exceeds max size of {MAX_ATTACHMENT_BYTES} bytes")
        return value

    @field_validator("extracted_text")
    @classmethod
    def validate_extracted_text(cls, value: str) -> str:
        if len(value) > MAX_EXTRACTED_TEXT_CHARS:
            raise ValueError(f"extracted_text exceeds max length of {MAX_EXTRACTED_TEXT_CHARS} chars")
        return value


class IntentAssessment(BaseModel):
    objective_clarity: str
    oversharing_risk: str
    recommendation: str


class AnalyzeRequest(BaseModel):
    employee_id: int
    prompt_text: str
    target_tool: str | None = None
    attachments: list[AttachmentContext] = Field(default_factory=list)
    metadata: dict[str, Any] | None = None


class AnalyzeResponse(BaseModel):
    prompt_id: int
    risk_level: RiskLevel
    action: ActionType
    detections: list[Detection]
    coaching_tip: str | None = None
    redacted_prompt: str | None = None
    layer_used: DetectionLayer
    confidence: float = Field(ge=0.0, le=1.0)
    estimated_cost_usd: float = Field(ge=0.0)
    skill_evaluation: "PromptSkillEvaluation | None" = None
    requires_confirmation: bool = False
    warning_context_id: str | None = None
    warning_reasons: list[str] = Field(default_factory=list)
    safer_alternatives: list[str] = Field(default_factory=list)
    intent_assessment: IntentAssessment | None = None


class MetricSnapshot(BaseModel):
    threats_blocked: int
    prompts_analyzed: int
    active_employees: int
    shadow_ai_events: int
    estimated_cost_saved_usd: float


class EmployeeSummary(BaseModel):
    id: int
    name: str
    department: str
    risk_score: float
    total_prompts: int
    ai_skill_score: float = 0.0


class EmployeeDetail(EmployeeSummary):
    recent_actions: dict[str, int]


class PromptSkillEvaluation(BaseModel):
    overall_score: float = Field(ge=0.0, le=1.0)
    skill_class: str
    dimension_scores: dict[str, float]
    strengths: list[str]
    improvements: list[str]
    coaching_message: str


class EmployeeSkillProfile(BaseModel):
    employee_id: int
    ai_skill_score: float
    skill_class: str
    prompts_evaluated: int
    last_strengths: list[str]
    last_improvements: list[str]
    assigned_lessons: list[str]
    updated_at: str


class CompanySkillSnapshot(BaseModel):
    average_skill_score: float
    employees_tracked: int
    low_skill_employees: int
    high_skill_employees: int


class SkillLesson(BaseModel):
    id: int
    skill_class: str
    title: str
    objective: str
    content: str
    is_active: bool


class SkillLessonAssignRequest(BaseModel):
    lesson_id: int


class SkillLessonCompleteRequest(BaseModel):
    lesson_id: int


class EmployeeLessonStatus(BaseModel):
    lesson_id: int
    title: str
    status: str
    assigned_at: str
    completed_at: str | None = None


class PromptSummary(BaseModel):
    id: int
    employee_id: int
    risk_level: RiskLevel
    action: ActionType
    target_tool: str | None
    created_at: str


class PromptDetail(PromptSummary):
    prompt_text: str
    redacted_prompt: str | None
    detections: list[Detection]
    coaching_tip: str | None


class PolicyRecord(BaseModel):
    id: int
    name: str
    role: str
    rule_json: dict[str, Any]
    updated_at: str


class UpdatePolicyRequest(BaseModel):
    rule_json: dict[str, Any]


class WeeklyReportResponse(BaseModel):
    week_start: str
    week_end: str
    summary: str
    kpis: dict[str, Any]


class ShadowAIEvent(BaseModel):
    id: int
    employee_id: int
    tool_domain: str
    risk_level: RiskLevel
    created_at: str


class AlertRecord(BaseModel):
    id: int
    alert_type: str
    severity: RiskLevel
    detail: str
    is_active: bool
    created_at: str


class AgentRecord(BaseModel):
    id: int
    name: str
    budget_usd: float
    spend_usd: float
    quality_score: float
    success_rate: float


class UpdateAgentBudgetRequest(BaseModel):
    budget_usd: float = Field(gt=0.0)


class AgentRunCreateRequest(BaseModel):
    agent_id: int
    task_type: str
    cost_usd: float = Field(ge=0.0)
    success: bool
    latency_ms: int = Field(ge=0)
    quality_score: float = Field(ge=0.0, le=1.0)
    value_score: float = Field(ge=0.0, le=1.0)
    metadata: dict[str, Any] | None = None


class AgentRunRecord(BaseModel):
    id: int
    agent_id: int
    task_type: str
    cost_usd: float
    success: bool
    latency_ms: int
    quality_score: float
    value_score: float
    created_at: str


class AgentSummaryRecord(BaseModel):
    id: int
    name: str
    budget_usd: float
    spend_usd: float
    remaining_budget_usd: float
    success_rate_7d: float
    avg_quality_7d: float
    avg_value_7d: float
    runs_7d: int
    roi_proxy: float


class AgentSummaryResponse(BaseModel):
    agents: list[AgentSummaryRecord]
    totals: dict[str, float]


class AgentRebalanceChange(BaseModel):
    agent_id: int
    old_budget_usd: float
    new_budget_usd: float
    reason: str


class AgentRebalanceResponse(BaseModel):
    changes: list[AgentRebalanceChange]


class AgentAttributionCreateRequest(BaseModel):
    agent_id: int
    run_id: int | None = None
    output_ref: str
    revenue_impact_usd: float = Field(default=0.0)
    cost_saved_usd: float = Field(default=0.0)
    quality_outcome_score: float = Field(ge=0.0, le=1.0)
    metadata: dict[str, Any] | None = None


class AgentAttributionRecord(BaseModel):
    id: int
    agent_id: int
    run_id: int | None
    output_ref: str
    revenue_impact_usd: float
    cost_saved_usd: float
    quality_outcome_score: float
    created_at: str


class AgentMemorySnapshot(BaseModel):
    agent_id: int
    run_count_30d: int
    spend_30d_usd: float
    revenue_impact_30d_usd: float
    cost_saved_30d_usd: float
    net_value_30d_usd: float
    profitability_index: float


class EmployeeMemoryEvent(BaseModel):
    id: int
    employee_id: int
    prompt_id: int
    risk_level: str
    action: str
    skill_score: float
    skill_class: str
    created_at: str


class EmployeeMemorySnapshot(BaseModel):
    employee_id: int
    interactions_30d: int
    avg_risk_score_30d: float
    avg_skill_score_30d: float
    latest_skill_class: str


class ErrorResponse(BaseModel):
    error: str
    detail: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthUser(BaseModel):
    id: int
    username: str
    role: str
    employee_id: int | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: AuthUser


class ExtensionCaptureRequest(BaseModel):
    prompt_text: str
    target_tool: str | None = None
    attachments: list[AttachmentContext] = Field(default_factory=list)
    warning_confirmed: bool = False
    warning_context_id: str | None = None
    metadata: dict[str, Any] | None = None
    employee_id: int | None = None


class ExtensionTurnCaptureRequest(BaseModel):
    prompt_text: str
    ai_output_text: str
    target_tool: str | None = None
    attachments: list[AttachmentContext] = Field(default_factory=list)
    conversation_id: str | None = None
    turn_id: str | None = None
    metadata: dict[str, Any] | None = None
    employee_id: int | None = None


class ExtensionTurnCaptureResponse(BaseModel):
    prompt_analysis: AnalyzeResponse
    output_analysis: AnalyzeResponse


class AgentActionEventRequest(BaseModel):
    agent_id: int
    task_type: str
    cost_usd: float = Field(ge=0.0)
    success: bool
    latency_ms: int = Field(ge=0)
    quality_score: float = Field(ge=0.0, le=1.0)
    value_score: float = Field(ge=0.0, le=1.0)
    metadata: dict[str, Any] | None = None


class CodeReviewSubmitRequest(BaseModel):
    employee_id: int
    code_text: str
    target_tool: str | None = None
    metadata: dict[str, Any] | None = None


class DispatchResult(BaseModel):
    generated_count: int
    message: str


class TickJobResult(BaseModel):
    job_name: str
    status: str
    generated_count: int
    detail: str


class TickResponse(BaseModel):
    ran_at: str
    jobs: list[TickJobResult]
