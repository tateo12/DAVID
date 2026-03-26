// ===== Risk & Status Types =====
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export type PolicyStatus = "active" | "draft" | "archived";
export type AgentStatus = "online" | "offline" | "degraded";
export type EmployeeStatus = "active" | "inactive" | "suspended";

// ===== Metrics =====
export interface Metrics {
  threats_blocked: number;
  threats_blocked_trend: number;
  cost_saved: number;
  cost_saved_trend: number;
  shadow_ai_detected: number;
  shadow_ai_trend: number;
  active_employees: number;
  active_employees_trend: number;
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

// ===== Policies =====
export interface Policy {
  id: string;
  name: string;
  description: string;
  full_text: string;
  status: PolicyStatus;
  last_updated: string;
  created_at: string;
  category: string;
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
