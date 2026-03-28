// ===== Risk & Status Types =====
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type AgentStatus = "online" | "offline" | "degraded";
export type EmployeeStatus = "active" | "inactive" | "suspended";

// ===== Metrics (from GET /api/metrics/dashboard — 7-day rolling + WoW %) =====
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

// ===== Agents =====
export interface Agent {
  id: string;
  name: string;
  description: string;
  api_spend: number;
  api_budget: number;
  requests_today: number;
  avg_latency_ms: number;
  status: AgentStatus;
  model: string;

  // Automation Profile
  automation_tasks?: AutomationOpportunity[];
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
    cost_saved: number;
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

// ===== Automation Analysis =====
export interface AutomationOpportunity {
  task_type: string;
  human_cost: number;
  ai_cost: number;
  cost_deficit: number;
  human_time_sec: number;
  ai_time_sec: number;
  time_deficit: number;
  automation_status: "Automate" | "Human-in-Loop" | "Human-Driven" | string;
  management_insight: string;
}

export interface AutomationAnalysisResponse {
  opportunities: AutomationOpportunity[];
}
