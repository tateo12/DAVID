from enum import Enum
from typing import Any, Literal

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
    # When False, analysis runs but nothing is persisted (extension pre-check).
    persist_prompt: bool = True


class AgentExecutionReport(BaseModel):
    agent_name: str
    status: str
    elapsed_ms: int = 0
    decisions: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


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
    orchestration_report: list[AgentExecutionReport] = Field(default_factory=list)
    orchestration_metadata: dict[str, Any] = Field(default_factory=dict)


class MetricSnapshot(BaseModel):
    threats_blocked: int
    prompts_analyzed: int
    active_employees: int
    shadow_ai_events: int


class ThreatTrendPoint(BaseModel):
    day: str
    threats: int
    blocked: int


class RiskDistributionSlice(BaseModel):
    level: str
    count: int


class DashboardMetrics(BaseModel):
    """Rolling 7-day operational KPIs + chart series (dashboard UI)."""

    threats_blocked: int
    prompts_analyzed: int
    active_employees: int
    shadow_ai_events: int
    threats_blocked_trend_pct: float | None = None
    shadow_ai_trend_pct: float | None = None
    active_employees_trend_pct: float | None = None
    threat_trend: list[ThreatTrendPoint] = Field(default_factory=list)
    risk_distribution: list[RiskDistributionSlice] = Field(default_factory=list)


class EmployeeSummary(BaseModel):
    id: int
    name: str
    department: str
    risk_score: float
    total_prompts: int
    ai_skill_score: float = 0.0
    email: str = ""


class EmployeeDetail(EmployeeSummary):
    recent_actions: dict[str, int]


class PromptSkillEvaluation(BaseModel):
    overall_score: float = Field(ge=0.0, le=1.0)
    skill_class: str
    dimension_scores: dict[str, float]
    strengths: list[str]
    improvements: list[str]
    coaching_message: str
    ai_use_profile_summary: str = ""


class EmployeeSkillProfile(BaseModel):
    employee_id: int
    ai_skill_score: float
    skill_class: str
    prompts_evaluated: int
    last_strengths: list[str]
    last_improvements: list[str]
    assigned_lessons: list[str]
    updated_at: str
    last_coaching_message: str = ""
    last_dimension_scores: dict[str, float] = Field(default_factory=dict)
    ai_use_profile_summary: str = ""


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
    sequence_order: int = 0
    lesson_kind: str = "lesson"
    unit_title: str = ""
    lesson_source: str = "legacy"


class CurriculumLessonRef(BaseModel):
    id: int
    title: str
    lesson_kind: str
    sequence_order: int
    objective: str = ""


class CurriculumUnitOutline(BaseModel):
    unit_title: str
    skill_class: str
    lessons: list[CurriculumLessonRef]


class CurriculumProgressResponse(BaseModel):
    total_curriculum_lessons: int
    completed_curriculum: int
    next_lesson_id: int


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
    unit_title: str | None = None
    lesson_kind: str | None = None
    lesson_source: str | None = None


class PromptSummary(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    risk_level: RiskLevel
    action: ActionType
    target_tool: str | None
    prompt_text: str | None = None
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


class CreatePolicyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=100)
    rule_json: dict[str, Any] = Field(default_factory=dict)


class PolicyPresetInfo(BaseModel):
    id: str
    label: str
    description: str


class PolicyAssistantChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PolicyAssistantChatRequest(BaseModel):
    messages: list[PolicyAssistantChatMessage]
    selected_presets: list[str] = Field(default_factory=list)
    draft_rule: dict[str, Any] = Field(default_factory=dict)


class PolicyAssistantChatResponse(BaseModel):
    message: str
    rule_json: dict[str, Any]
    used_llm: bool = False


class WeeklyReportResponse(BaseModel):
    week_start: str
    week_end: str
    summary: str
    kpis: dict[str, Any]
    threat_trend: list[dict[str, Any]] = Field(default_factory=list)
    top_risks: list[dict[str, Any]] = Field(default_factory=list)


class AutomationOpportunity(BaseModel):
    task_type: str
    human_cost: float
    ai_cost: float
    cost_deficit: float
    human_time_sec: float
    ai_time_sec: float
    time_deficit: float
    automation_status: str
    management_insight: str


class AutomationAnalysisResponse(BaseModel):
    opportunities: list[AutomationOpportunity]


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


class ScoutChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ScoutChatRequest(BaseModel):
    messages: list[ScoutChatMessage]


class ScoutChatResponse(BaseModel):
    message: str
    used_llm: bool = False


class ScoutTelemetryResponse(BaseModel):
    total_prompts: int
    digest: str
    llm_available: bool


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


class EmployeeTeamMember(BaseModel):
    """Manager directory view: onboarding + extension status."""

    id: int
    name: str
    department: str
    role: str
    risk_score: float
    total_prompts: int
    ai_skill_score: float = 0.0
    email: str = ""
    invite_sent_at: str | None = None
    invite_reminder_sent_at: str | None = None
    account_claimed_at: str | None = None
    extension_first_seen_at: str | None = None
    linked_username: str | None = None


class EmployeeInviteCreate(BaseModel):
    email: str
    name: str = ""
    department: str = "General"
    role: str = "employee"


class EmployeeInviteCreated(BaseModel):
    employee_id: int
    invite_url: str


class EmployeePatch(BaseModel):
    name: str | None = None
    department: str | None = None
    role: str | None = None


class AuthUser(BaseModel):
    id: int
    username: str
    role: str
    employee_id: int | None = None
    org_id: int | None = None
    org_name: str = ""


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: AuthUser
    is_new_user: bool = False
    # Tells the frontend what screen to show after login
    # "dashboard" = normal, "setup_org" = new user needs to request/create org,
    # "pending_approval" = user requested an org, waiting for admin approval
    onboarding_status: str = "dashboard"


class ExtensionCaptureRequest(BaseModel):
    prompt_text: str
    target_tool: str | None = None
    attachments: list[AttachmentContext] = Field(default_factory=list)
    warning_confirmed: bool = False
    warning_context_id: str | None = None
    metadata: dict[str, Any] | None = None
    employee_id: int | None = None
    # True: analysis for UX only; no DB rows (browser pre-check).
    preview_only: bool = False


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
