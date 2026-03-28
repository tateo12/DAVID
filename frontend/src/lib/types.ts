// ===== Risk & Status Types =====
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type EmployeeStatus = "active" | "inactive" | "suspended";

// ===== Metrics (from GET /api/metrics/dashboard — 7-day rolling + WoW %) =====
/** GET /api/policies/assistant/presets */
export interface PolicyPresetInfo {
  id: string;
  label: string;
  description: string;
}

/** GET /api/alerts */
export interface AlertRecord {
  id: number;
  alert_type: string;
  severity: RiskLevel;
  detail: string;
  is_active: boolean;
  created_at: string;
}

/** GET /api/scout/telemetry */
export interface ScoutTelemetryResponse {
  total_prompts: number;
  digest: string;
  llm_available: boolean;
}

export type ScoutChatRole = "user" | "assistant";

export interface ScoutChatMessage {
  role: ScoutChatRole;
  content: string;
}

export interface Metrics {
  threats_blocked: number;
  threats_blocked_trend: number | null;
  cost_saved: number;
  cost_saved_trend: number | null;
  shadow_ai_detected: number;
  shadow_ai_trend: number | null;
  active_employees: number;
  active_employees_trend: number | null;
  threat_trend_chart: Array<{ day: string; threats: number; blocked: number }>;
  risk_distribution: Array<{ level: string; count: number }>;
  /** Set when GET /api/metrics/dashboard fails; UI must not invent scores from empty payloads. */
  load_error?: string;
}

// ===== Analysis =====
export interface AnalysisResult {
  id: string;
  prompt: string;
  risk_level: RiskLevel;
  risk_score: number;
  categories: string[];
  reasoning: string;
  timestamp: string;
  employee?: string;
  department?: string;
}

// ===== Employees =====
export interface EmployeeTeamMember {
  id: number;
  name: string;
  department: string;
  role: string;
  risk_score: number;
  total_prompts: number;
  ai_skill_score: number;
  email: string;
  invite_sent_at: string | null;
  invite_reminder_sent_at: string | null;
  account_claimed_at: string | null;
  extension_first_seen_at: string | null;
  linked_username: string | null;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  risk_score: number;
  total_prompts: number;
  flagged_prompts: number;
  last_active: string;
  status: EmployeeStatus;
  avatar_url?: string;
  risk_trend: number[];
  /** 0–100 when provided from API */
  ai_skill_score?: number;
  prompt_history?: PromptRecord[];
}

// ===== Prompts =====
export interface PromptRecord {
  id: string;
  prompt: string;
  employee_name: string;
  employee_id: string;
  department: string;
  risk_level: RiskLevel;
  risk_score: number;
  categories: string[];
  reasoning: string;
  timestamp: string;
}

// ===== Policies (API: GET/PUT /api/policies) =====
export interface Policy {
  id: number;
  name: string;
  role: string;
  rule_json: Record<string, unknown>;
  updated_at: string;
}

// ===== Shadow AI =====
export interface ShadowAIFlag {
  id: string;
  employee_name: string;
  employee_id: string;
  department: string;
  tool_detected: string;
  date: string;
  risk_level: RiskLevel;
  action_taken: string;
  details: string;
}

export interface ShadowAISummary {
  total_flags: number;
  unique_tools: number;
  employees_involved: number;
  flags: ShadowAIFlag[];
}

/** GET /api/employees/{id}/skill */
export interface EmployeeSkillProfile {
  employee_id: number;
  ai_skill_score: number;
  skill_class: string;
  prompts_evaluated: number;
  last_strengths: string[];
  last_improvements: string[];
  assigned_lessons: string[];
  updated_at: string;
  last_coaching_message?: string;
  last_dimension_scores?: Record<string, number>;
  ai_use_profile_summary?: string;
}

/** Employee lesson row from API */
export interface EmployeeLessonRow {
  lesson_id: number;
  title: string;
  status: string;
  assigned_at: string;
  completed_at?: string | null;
  unit_title?: string | null;
  lesson_kind?: string | null;
  lesson_source?: string | null;
}

export interface CurriculumLessonRef {
  id: number;
  title: string;
  lesson_kind: string;
  sequence_order: number;
  objective?: string;
}

export interface CurriculumUnitOutline {
  unit_title: string;
  skill_class: string;
  lessons: CurriculumLessonRef[];
}

/** GET /api/employees/{id}/skill/curriculum/progress */
export interface CurriculumProgress {
  total_curriculum_lessons: number;
  completed_curriculum: number;
  next_lesson_id: number;
}

/** GET /api/employees/skills/curriculum/lessons/{id} */
export interface SkillLessonDetail {
  id: number;
  skill_class: string;
  title: string;
  objective: string;
  content: string;
  is_active: boolean;
  sequence_order: number;
  lesson_kind: string;
  unit_title: string;
  lesson_source: string;
}

// ===== Reports =====
export interface WeeklyReport {
  id: string;
  week_start: string;
  week_end: string;
  generated_at: string;
  key_metrics: {
    total_prompts: number;
    threats_blocked: number;
    high_risk_users: number;
    avg_risk_score: number;
  };
  threat_trend: { date: string; threats: number; safe: number }[];
  top_risks: {
    employee: string;
    department: string;
    risk_score: number;
    flagged_prompts: number;
  }[];
  recommendations: string[];
}
