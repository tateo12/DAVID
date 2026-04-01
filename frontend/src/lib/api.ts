import {
  Metrics,
  AnalysisResult,
  Employee,
  PromptRecord,
  Policy,
  ShadowAISummary,
  WeeklyReport,
  RiskLevel,
  EmployeeSkillProfile,
  EmployeeLessonRow,
  CurriculumUnitOutline,
  AlertRecord,
  ScoutTelemetryResponse,
  ScoutChatMessage,
  PolicyPresetInfo,
  CurriculumProgress,
  SkillLessonDetail,
  EmployeeTeamMember,
} from "./types";
import { getSession } from "./session";
import type { AuthUser } from "./session";

/** API origin; set NEXT_PUBLIC_API_BASE in deployed environments. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type BackendRiskLevel = "low" | "medium" | "high" | "critical";

interface BackendDashboardMetrics {
  threats_blocked: number;
  prompts_analyzed: number;
  active_employees: number;
  shadow_ai_events: number;
  threats_blocked_trend_pct: number | null;
  shadow_ai_trend_pct: number | null;
  active_employees_trend_pct: number | null;
  threat_trend: Array<{ day: string; threats: number; blocked: number }>;
  risk_distribution: Array<{ level: string; count: number }>;
}

interface BackendAnalyzeResponse {
  prompt_id: number;
  risk_level: BackendRiskLevel;
  action: string;
  detections: Array<{ type: string; subtype: string }>;
  coaching_tip?: string;
  redacted_prompt?: string;
  confidence: number;
}

interface BackendEmployeeSummary {
  id: number;
  name: string;
  department: string;
  risk_score: number;
  total_prompts: number;
  ai_skill_score?: number;
  email?: string;
}

interface BackendPromptSummary {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  risk_level: BackendRiskLevel;
  action: string;
  target_tool?: string | null;
  prompt_text?: string | null;
  created_at: string;
}

interface BackendWeeklyReport {
  week_start: string;
  week_end: string;
  summary: string;
  kpis: Record<string, number | string>;
  threat_trend?: Array<{ date: string; threats: number; safe: number }>;
  top_risks?: Array<{
    employee: string;
    department: string;
    risk_score: number;
    flagged_prompts: number;
  }>;
}

interface BackendShadowAIEvent {
  id: number;
  employee_id: number;
  tool_domain: string;
  risk_level: BackendRiskLevel;
  created_at: string;
}

// ===== Generic Fetch Helper =====
async function apiFetch<T>(endpoint: string, options?: RequestInit, withAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (withAuth) {
    const session = typeof window !== "undefined" ? getSession() : null;
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : text || res.statusText;
    const err = new Error(`${res.status}: ${detail}`) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

// ===== API Functions =====
const emptyMetrics = (): Metrics => ({
  threats_blocked: 0,
  threats_blocked_trend: null,
  shadow_ai_detected: 0,
  shadow_ai_trend: null,
  active_employees: 0,
  active_employees_trend: null,
  threat_trend_chart: [],
  risk_distribution: [],
});

export async function fetchHealth(): Promise<{ status: string } | null> {
  try {
    return await apiFetch<{ status: string }>("/health", undefined, false);
  } catch {
    return null;
  }
}

export async function fetchAlerts(): Promise<AlertRecord[]> {
  try {
    return await apiFetch<AlertRecord[]>("/api/alerts");
  } catch {
    return [];
  }
}

export async function fetchScoutTelemetry(): Promise<ScoutTelemetryResponse | null> {
  try {
    return await apiFetch<ScoutTelemetryResponse>("/api/scout/telemetry");
  } catch {
    return null;
  }
}

export async function postScoutChat(messages: ScoutChatMessage[]): Promise<{ message: string; used_llm: boolean }> {
  return apiFetch<{ message: string; used_llm: boolean }>("/api/scout/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

export async function fetchMetrics(): Promise<Metrics> {
  try {
    const data = await apiFetch<BackendDashboardMetrics>("/api/metrics/dashboard");
    return {
      threats_blocked: data.threats_blocked,
      threats_blocked_trend: data.threats_blocked_trend_pct,
      shadow_ai_detected: data.shadow_ai_events,
      shadow_ai_trend: data.shadow_ai_trend_pct,
      active_employees: data.active_employees,
      active_employees_trend: data.active_employees_trend_pct,
      threat_trend_chart: data.threat_trend.map((p) => ({
        day: p.day,
        threats: p.threats,
        blocked: p.blocked,
      })),
      risk_distribution: data.risk_distribution,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...emptyMetrics(), load_error: msg };
  }
}

export async function analyzePrompt(prompt: string, employeeId: number): Promise<AnalysisResult> {
  try {
    const data = await apiFetch<BackendAnalyzeResponse>("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        employee_id: employeeId,
        prompt_text: prompt,
        target_tool: "sentinel-command-ui",
      }),
    });
    return {
      id: `analysis-${data.prompt_id}`,
      prompt,
      risk_level: data.risk_level,
      risk_score: Math.round((data.confidence ?? 0.5) * 100),
      categories: data.detections.map((d) => `${d.type}:${d.subtype}`),
      reasoning: data.coaching_tip ?? `Action: ${data.action}`,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      id: "error",
      prompt,
      risk_level: "low" as RiskLevel,
      risk_score: 0,
      categories: [],
      reasoning: "Backend unavailable",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function fetchEmployees(): Promise<Employee[]> {
  try {
    const data = await apiFetch<BackendEmployeeSummary[]>("/api/employees");
    return data.map((emp) => ({
      id: String(emp.id),
      name: emp.name,
      email:
        (emp.email && emp.email.trim()) ||
        `${emp.name.toLowerCase().replace(/\s+/g, ".")}@company.com`,
      department: emp.department,
      risk_score: Math.round(emp.risk_score * 100),
      total_prompts: emp.total_prompts,
      flagged_prompts: 0,
      last_active: "",
      status: "active",
      risk_trend: [],
      ai_skill_score: emp.ai_skill_score !== undefined ? Math.round(emp.ai_skill_score * 100) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function fetchPrompts(limit = 50): Promise<PromptRecord[]> {
  try {
    const [prompts, employees] = await Promise.all([
      apiFetch<BackendPromptSummary[]>(`/api/prompts?limit=${limit}`),
      fetchEmployees(),
    ]);
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    return prompts.map((p) => {
      const emp = employeeMap.get(String(p.employee_id));
      const riskScore = p.risk_level === "low" ? 25 : p.risk_level === "medium" ? 50 : p.risk_level === "high" ? 75 : 95;
      return {
        id: String(p.id),
        prompt: p.prompt_text || (p.target_tool ? `Prompt captured via ${p.target_tool}` : "Prompt captured"),
        employee_name: p.employee_name || emp?.name || `Employee ${p.employee_id}`,
        employee_id: String(p.employee_id),
        department: emp?.department ?? "Unknown",
        risk_level: p.risk_level as RiskLevel,
        risk_score: riskScore,
        categories: [p.action],
        reasoning: `Action: ${p.action}`,
        timestamp: p.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchWeeklyReport(): Promise<WeeklyReport> {
  try {
    const report = await apiFetch<BackendWeeklyReport>("/api/reports/weekly");
    const totalPrompts = Number(report.kpis.total_prompts ?? report.kpis.prompts_7d ?? 0);
    const threatsBlocked = Number(report.kpis.threats_blocked ?? 0);
    const threatsTrend = report.threat_trend ?? [];
    const topRisks = report.top_risks ?? [];
    return {
      id: `weekly-${report.week_start}`,
      week_start: report.week_start,
      week_end: report.week_end,
      generated_at: new Date().toISOString(),
      key_metrics: {
        total_prompts: totalPrompts,
        threats_blocked: threatsBlocked,
        high_risk_users: Number(report.kpis.high_risk_users ?? 0),
        avg_risk_score: Number(report.kpis.avg_risk_score ?? 0),
      },
      threat_trend: threatsTrend.map((d) => ({
        date: d.date,
        threats: d.threats,
        safe: d.safe,
      })),
      top_risks: topRisks.map((r) => ({
        employee: r.employee,
        department: r.department,
        risk_score: r.risk_score,
        flagged_prompts: r.flagged_prompts,
      })),
      recommendations: [report.summary],
    };
  } catch {
    return {
      id: "",
      week_start: "",
      week_end: "",
      generated_at: "",
      key_metrics: { total_prompts: 0, threats_blocked: 0, high_risk_users: 0, avg_risk_score: 0 },
      threat_trend: [],
      top_risks: [],
      recommendations: [],
    };
  }
}

export async function fetchEmployeeSkill(employeeId: string): Promise<EmployeeSkillProfile | null> {
  try {
    return await apiFetch<EmployeeSkillProfile>(`/api/employees/${employeeId}/skill`);
  } catch {
    return null;
  }
}

export async function fetchEmployeeLessons(employeeId: string): Promise<EmployeeLessonRow[]> {
  try {
    return await apiFetch<EmployeeLessonRow[]>(`/api/employees/${employeeId}/skill/lessons`);
  } catch {
    return [];
  }
}

export async function fetchCurriculumOutline(): Promise<CurriculumUnitOutline[]> {
  try {
    return await apiFetch<CurriculumUnitOutline[]>("/api/employees/skills/curriculum/outline");
  } catch {
    return [];
  }
}

export async function fetchCurriculumLessonDetail(lessonId: number): Promise<SkillLessonDetail | null> {
  try {
    return await apiFetch<SkillLessonDetail>(`/api/employees/skills/curriculum/lessons/${lessonId}`);
  } catch {
    return null;
  }
}

export async function fetchEmployeeCurriculumProgress(employeeId: string): Promise<CurriculumProgress | null> {
  try {
    return await apiFetch<CurriculumProgress>(`/api/employees/${employeeId}/skill/curriculum/progress`);
  } catch {
    return null;
  }
}

export async function postAssignSkillLesson(
  employeeId: string,
  lessonId: number
): Promise<EmployeeLessonRow> {
  return apiFetch<EmployeeLessonRow>(`/api/employees/${employeeId}/skill/lessons/assign`, {
    method: "POST",
    body: JSON.stringify({ lesson_id: lessonId }),
  });
}

export async function postAutoAssignEmployeeLessons(
  employeeId: string,
  needBased = false
): Promise<EmployeeLessonRow[]> {
  const q = needBased ? "?need_based=true" : "";
  return apiFetch<EmployeeLessonRow[]>(`/api/employees/${employeeId}/skill/lessons/auto-assign${q}`, {
    method: "POST",
    body: "{}",
  });
}

export async function postCompleteEmployeeLesson(
  employeeId: string,
  lessonId: number
): Promise<EmployeeLessonRow> {
  return apiFetch<EmployeeLessonRow>(`/api/employees/${employeeId}/skill/lessons/complete`, {
    method: "POST",
    body: JSON.stringify({ lesson_id: lessonId }),
  });
}

export async function fetchShadowAI(): Promise<ShadowAISummary> {
  try {
    const [events, employees] = await Promise.all([
      apiFetch<BackendShadowAIEvent[]>("/api/shadow-ai"),
      fetchEmployees(),
    ]);
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    const uniqueTools = new Set(events.map((e) => e.tool_domain)).size;
    const uniqueEmployees = new Set(events.map((e) => e.employee_id)).size;
    return {
      total_flags: events.length,
      unique_tools: uniqueTools,
      employees_involved: uniqueEmployees,
      flags: events.map((event) => {
        const emp = employeeMap.get(String(event.employee_id));
        return {
          id: String(event.id),
          employee_name: emp?.name ?? `Employee ${event.employee_id}`,
          employee_id: String(event.employee_id),
          department: emp?.department ?? "Unknown",
          tool_detected: event.tool_domain,
          date: event.created_at,
          risk_level: event.risk_level as RiskLevel,
          action_taken: "Logged",
          details: "Shadow AI tool domain logged from telemetry.",
        };
      }),
    };
  } catch {
    return { total_flags: 0, unique_tools: 0, employees_involved: 0, flags: [] };
  }
}

export async function fetchPolicies(): Promise<Policy[]> {
  return apiFetch<Policy[]>("/api/policies");
}

export async function fetchPolicyPresets(): Promise<PolicyPresetInfo[]> {
  return apiFetch<PolicyPresetInfo[]>("/api/policies/assistant/presets", undefined, false);
}

export async function fetchTeamDirectory(): Promise<EmployeeTeamMember[]> {
  return apiFetch<EmployeeTeamMember[]>("/api/employees/team");
}

export async function createEmployeeInvite(payload: {
  email: string;
  name?: string;
  department?: string;
  role?: string;
}): Promise<{ employee_id: number; invite_url: string }> {
  return apiFetch("/api/employees/invites", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchEmployee(
  employeeId: number,
  payload: { name?: string; department?: string; role?: string }
): Promise<EmployeeTeamMember> {
  return apiFetch<EmployeeTeamMember>(`/api/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployee(employeeId: number): Promise<void> {
  await apiFetch<{ status: string }>(`/api/employees/${employeeId}`, { method: "DELETE" });
}

export async function registerInvite(payload: {
  token: string;
  username: string;
  password: string;
  display_name?: string;
}): Promise<{ access_token: string; expires_at: string; user: AuthUser }> {
  return apiFetch("/api/auth/register-invite", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false);
}

export async function postPolicyAssistantChat(payload: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  selected_presets: string[];
  draft_rule: Record<string, unknown>;
}): Promise<{ message: string; rule_json: Record<string, unknown>; used_llm: boolean }> {
  return apiFetch("/api/policies/assistant/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePolicy(
  policyId: number,
  ruleJson: Record<string, unknown>
): Promise<Policy> {
  return apiFetch<Policy>(`/api/policies/${policyId}`, {
    method: "PUT",
    body: JSON.stringify({ rule_json: ruleJson }),
  });
}

export async function createPolicy(payload: {
  name: string;
  role: string;
  rule_json: Record<string, unknown>;
}): Promise<Policy> {
  return apiFetch<Policy>("/api/policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function registerOtpRequest(payload: { email: string; company_name: string; role: string }) {
  return apiFetch("/api/auth/register-request", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false);
}

export async function registerOtpVerify(payload: { email: string; code: string; username: string; password: string }): Promise<{ access_token: string; expires_at: string; user: AuthUser }> {
  return apiFetch("/api/auth/register-verify", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false);
}

export async function loginUser(username: string, password: string): Promise<{
  access_token: string;
  user: AuthUser;
}> {
  return apiFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
    false
  );
}

// ----- Operations / automation (manager dashboard) -----

export type OpsDispatchResult = {
  generated_count: number;
  message: string;
};

export type OpsTickJobResult = {
  job_name: string;
  status: string;
  generated_count: number;
  detail: string;
};

export type OpsTickResponse = {
  ran_at: string;
  jobs: OpsTickJobResult[];
};

export async function postOpsTick(force = false): Promise<OpsTickResponse> {
  const q = force ? "?force=true" : "?force=false";
  return apiFetch<OpsTickResponse>(`/api/ops/tick${q}`, { method: "POST" });
}

export async function postOpsDispatchDailyCoaching(): Promise<OpsDispatchResult> {
  return apiFetch<OpsDispatchResult>("/api/ops/dispatch/daily-coaching", { method: "POST" });
}

export async function postOpsDispatchWeeklyManagerReport(): Promise<OpsDispatchResult> {
  return apiFetch<OpsDispatchResult>("/api/ops/dispatch/weekly-manager-report", { method: "POST" });
}

export async function postOpsDispatchWeeklyLearning(): Promise<OpsDispatchResult> {
  return apiFetch<OpsDispatchResult>("/api/ops/dispatch/weekly-learning", { method: "POST" });
}

export async function postOpsDispatchSecurityNotices(): Promise<OpsDispatchResult> {
  return apiFetch<OpsDispatchResult>("/api/ops/dispatch/security-notices", { method: "POST" });
}
