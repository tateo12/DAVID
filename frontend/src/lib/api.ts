import {
  Metrics,
  AnalysisResult,
  Employee,
  PromptRecord,
  Policy,
  ShadowAISummary,
  Agent,
  WeeklyReport,
  RiskLevel,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://david-production-f999.up.railway.app";
const DEFAULT_EMPLOYEE_ID = 1;

type BackendRiskLevel = "low" | "medium" | "high" | "critical";

interface BackendMetricSnapshot {
  threats_blocked: number;
  prompts_analyzed: number;
  active_employees: number;
  shadow_ai_events: number;
  estimated_cost_saved_usd: number;
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
}

interface BackendPromptSummary {
  id: number;
  employee_id: number;
  risk_level: BackendRiskLevel;
  action: string;
  target_tool?: string | null;
  created_at: string;
}

interface BackendWeeklyReport {
  week_start: string;
  week_end: string;
  summary: string;
  kpis: Record<string, number | string>;
}

interface BackendShadowAIEvent {
  id: number;
  employee_id: number;
  tool_domain: string;
  risk_level: BackendRiskLevel;
  created_at: string;
}

interface BackendAgent {
  id: number;
  name: string;
  budget_usd: number;
  spend_usd: number;
  quality_score: number;
  success_rate: number;
}

// ===== Generic Fetch Helper =====
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch {
    throw new Error(`Failed to fetch ${endpoint}`);
  }
}

// ===== API Functions =====
export async function fetchMetrics(): Promise<Metrics> {
  try {
    const data = await apiFetch<BackendMetricSnapshot>("/api/metrics");
    return {
      threats_blocked: data.threats_blocked,
      threats_blocked_trend: 0,
      cost_saved: Math.round(data.estimated_cost_saved_usd),
      cost_saved_trend: 0,
      shadow_ai_detected: data.shadow_ai_events,
      shadow_ai_trend: 0,
      active_employees: data.active_employees,
      active_employees_trend: 0,
    };
  } catch {
    return { threats_blocked: 0, threats_blocked_trend: 0, cost_saved: 0, cost_saved_trend: 0, shadow_ai_detected: 0, shadow_ai_trend: 0, active_employees: 0, active_employees_trend: 0 };
  }
}

export async function analyzePrompt(prompt: string): Promise<AnalysisResult> {
  try {
    const data = await apiFetch<BackendAnalyzeResponse>("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        employee_id: DEFAULT_EMPLOYEE_ID,
        prompt_text: prompt,
        target_tool: "sentinel-demo-ui",
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
    return { id: "error", prompt, risk_level: "safe" as RiskLevel, risk_score: 0, categories: [], reasoning: "Backend unavailable", timestamp: new Date().toISOString() };
  }
}

export async function fetchEmployees(): Promise<Employee[]> {
  try {
    const data = await apiFetch<BackendEmployeeSummary[]>("/api/employees");
    return data.map((emp) => ({
      id: String(emp.id),
      name: emp.name,
      email: `${emp.name.toLowerCase().replace(/\s+/g, ".")}@company.com`,
      department: emp.department,
      risk_score: Math.round(emp.risk_score * 100),
      total_prompts: emp.total_prompts,
      flagged_prompts: 0,
      last_active: new Date().toISOString(),
      status: "active",
      risk_trend: [],
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
        prompt: p.target_tool ? `Prompt captured via ${p.target_tool}` : "Prompt captured",
        employee_name: emp?.name ?? `Employee ${p.employee_id}`,
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
    const totalPrompts = Number(report.kpis.total_prompts ?? 0);
    const threatsBlocked = Number(report.kpis.threats_blocked ?? 0);
    const costSaved = Number(report.kpis.estimated_cost_saved_usd ?? 0);
    return {
      id: `weekly-${report.week_start}`,
      week_start: report.week_start,
      week_end: report.week_end,
      generated_at: new Date().toISOString(),
      key_metrics: {
        total_prompts: totalPrompts,
        threats_blocked: threatsBlocked,
        high_risk_users: Number(report.kpis.high_risk_users ?? 0),
        cost_saved: Math.round(costSaved),
        avg_risk_score: Number(report.kpis.avg_risk_score ?? 0),
      },
      threat_trend: [],
      top_risks: [],
      recommendations: [report.summary],
    };
  } catch {
    return { id: "", week_start: "", week_end: "", generated_at: "", key_metrics: { total_prompts: 0, threats_blocked: 0, high_risk_users: 0, cost_saved: 0, avg_risk_score: 0 }, threat_trend: [], top_risks: [], recommendations: [] };
  }
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
          details: "Detected by backend shadow AI monitor.",
        };
      }),
    };
  } catch {
    return { total_flags: 0, unique_tools: 0, employees_involved: 0, flags: [] };
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  try {
    const agents = await apiFetch<BackendAgent[]>("/api/agents");
    return agents.map((agent) => ({
      id: String(agent.id),
      name: agent.name,
      description: `Quality ${(agent.quality_score * 100).toFixed(0)}% / Success ${(agent.success_rate * 100).toFixed(0)}%`,
      api_spend: agent.spend_usd,
      api_budget: agent.budget_usd,
      requests_today: 0,
      avg_latency_ms: 0,
      status: agent.success_rate > 0.6 ? "online" : "degraded",
      model: "Managed by backend",
    }));
  } catch {
    return [];
  }
}

// ===== Static Data =====
const mockPolicies: Policy[] = [
  {
    id: "pol-1",
    name: "Data Classification & Handling",
    description: "Guidelines for how employees should classify and handle data when using AI tools.",
    full_text: "All employees must classify data according to our four-tier system (Public, Internal, Confidential, Restricted) before sharing with any AI tool. Restricted and Confidential data must NEVER be shared with external AI services. Internal data may be shared with approved AI tools only. Violations will be logged and escalated to the security team.",
    status: "active",
    last_updated: "2026-03-15T10:00:00Z",
    created_at: "2026-01-10T10:00:00Z",
    category: "Data Protection",
  },
  {
    id: "pol-2",
    name: "Approved AI Tools List",
    description: "Maintained list of AI tools approved for enterprise use.",
    full_text: "Only the following AI tools are approved for use: GitHub Copilot (Engineering only), ChatGPT Enterprise (All departments), Grammarly Business (All departments), Midjourney (Design & Marketing). Any use of unapproved AI tools will trigger a Shadow AI alert. Requests for new tools must go through the AI Governance Committee.",
    status: "active",
    last_updated: "2026-03-20T14:00:00Z",
    created_at: "2026-02-01T10:00:00Z",
    category: "Tool Governance",
  },
  {
    id: "pol-3",
    name: "Prompt Injection Prevention",
    description: "Security controls to detect and prevent prompt injection attacks.",
    full_text: "All prompts submitted to AI systems must be scanned for injection patterns before execution. Known injection patterns include: system prompt overrides, role-playing attacks, delimiter manipulation, and encoded payload delivery. Detected injections are blocked and the incident is logged.",
    status: "active",
    last_updated: "2026-03-18T09:00:00Z",
    created_at: "2026-01-15T10:00:00Z",
    category: "Security",
  },
  {
    id: "pol-4",
    name: "AI Output Review Requirements",
    description: "Requirements for reviewing AI-generated outputs before use in production.",
    full_text: "All AI-generated code must undergo standard code review before merging. AI-generated content for external communications must be reviewed by the communications team. AI-generated data analysis must be validated against source data. No AI output should be used as the sole basis for HR or legal decisions.",
    status: "active",
    last_updated: "2026-03-22T11:00:00Z",
    created_at: "2026-02-15T10:00:00Z",
    category: "Quality Assurance",
  },
  {
    id: "pol-5",
    name: "AI Budget Controls",
    description: "API spending limits and budget controls for AI agent usage.",
    full_text: "Each department has a monthly AI API budget. Engineering: $5,000/month. Marketing: $2,000/month. All other departments: $1,000/month. Budget overages require VP approval. Real-time spending dashboards are available in the Sentinel dashboard.",
    status: "draft",
    last_updated: "2026-03-25T16:00:00Z",
    created_at: "2026-03-20T10:00:00Z",
    category: "Financial",
  },
  {
    id: "pol-6",
    name: "Incident Response for AI Security Events",
    description: "Procedures for responding to AI-related security incidents.",
    full_text: "Critical AI security events (risk score > 80) trigger immediate response: 1) Auto-block the request, 2) Notify the SOC team, 3) Suspend the user's AI access pending review, 4) Generate an incident report. High-risk events (60-80) are logged and reviewed within 4 hours. Medium events are included in the daily security digest.",
    status: "active",
    last_updated: "2026-03-10T10:00:00Z",
    created_at: "2026-01-20T10:00:00Z",
    category: "Incident Response",
  },
];

export { mockPolicies };

