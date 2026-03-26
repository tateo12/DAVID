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

const API_BASE = "http://localhost:8000";

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
    return await apiFetch<Metrics>("/api/metrics");
  } catch {
    return mockMetrics;
  }
}

export async function analyzePrompt(prompt: string): Promise<AnalysisResult> {
  try {
    return await apiFetch<AnalysisResult>("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  } catch {
    return generateMockAnalysis(prompt);
  }
}

export async function fetchEmployees(): Promise<Employee[]> {
  try {
    return await apiFetch<Employee[]>("/api/employees");
  } catch {
    return mockEmployees;
  }
}

export async function fetchPrompts(limit = 50): Promise<PromptRecord[]> {
  try {
    return await apiFetch<PromptRecord[]>(`/api/prompts?limit=${limit}`);
  } catch {
    return mockPrompts;
  }
}

export async function fetchWeeklyReport(): Promise<WeeklyReport> {
  try {
    return await apiFetch<WeeklyReport>("/api/reports/weekly");
  } catch {
    return mockWeeklyReport;
  }
}

export async function fetchShadowAI(): Promise<ShadowAISummary> {
  try {
    return await apiFetch<ShadowAISummary>("/api/shadow-ai");
  } catch {
    return mockShadowAI;
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  try {
    return await apiFetch<Agent[]>("/api/agents");
  } catch {
    return mockAgents;
  }
}

// ===== Mock Data =====
const mockMetrics: Metrics = {
  threats_blocked: 1247,
  threats_blocked_trend: 12.5,
  cost_saved: 48920,
  cost_saved_trend: 8.3,
  shadow_ai_detected: 23,
  shadow_ai_trend: -5.2,
  active_employees: 342,
  active_employees_trend: 3.1,
};

function generateMockAnalysis(prompt: string): AnalysisResult {
  const riskWords = ["password", "secret", "hack", "exploit", "bypass", "injection", "admin", "delete", "drop table"];
  const cautionWords = ["customer data", "salary", "personal", "ssn", "credit card", "internal"];
  const lower = prompt.toLowerCase();

  let risk_level: RiskLevel = "safe";
  let risk_score = 12;
  let categories: string[] = [];

  if (riskWords.some((w) => lower.includes(w))) {
    risk_level = "critical";
    risk_score = 92;
    categories = ["Prompt Injection", "Data Exfiltration"];
  } else if (cautionWords.some((w) => lower.includes(w))) {
    risk_level = "medium";
    risk_score = 55;
    categories = ["Sensitive Data Exposure"];
  } else if (lower.length > 100) {
    risk_level = "low";
    risk_score = 28;
    categories = ["Unusual Length"];
  }

  return {
    id: `analysis-${Date.now()}`,
    prompt,
    risk_level,
    risk_score,
    categories,
    reasoning:
      risk_level === "safe"
        ? "No security concerns detected. Prompt is within acceptable parameters."
        : `Detected potential ${categories.join(", ")} risk. Review recommended.`,
    timestamp: new Date().toISOString(),
  };
}

const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Legal", "Product", "Design"];
const firstNames = ["Sarah", "James", "Maria", "David", "Emily", "Michael", "Jessica", "Robert", "Lisa", "Daniel", "Amanda", "Christopher", "Jennifer", "Matthew", "Ashley", "Andrew"];
const lastNames = ["Chen", "Johnson", "Williams", "Patel", "Rodriguez", "Kim", "Thompson", "Garcia", "Martinez", "Anderson", "Taylor", "Thomas", "Jackson", "White", "Harris", "Clark"];

const mockEmployees: Employee[] = Array.from({ length: 24 }, (_, i) => {
  const riskScore = Math.floor(Math.random() * 100);
  return {
    id: `emp-${i + 1}`,
    name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    email: `${firstNames[i % firstNames.length].toLowerCase()}.${lastNames[i % lastNames.length].toLowerCase()}@company.com`,
    department: departments[i % departments.length],
    risk_score: riskScore,
    total_prompts: Math.floor(Math.random() * 500) + 20,
    flagged_prompts: Math.floor(Math.random() * 15),
    last_active: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: riskScore > 75 ? "suspended" : riskScore > 50 ? "active" : "active",
    risk_trend: Array.from({ length: 7 }, () => Math.floor(Math.random() * 100)),
  };
}).sort((a, b) => b.risk_score - a.risk_score);

const samplePrompts = [
  "How do I optimize our React component rendering pipeline?",
  "Write a SQL query to get customer purchase history",
  "Help me bypass the authentication check for testing",
  "Generate a marketing email for our Q4 campaign",
  "How to access the production database credentials",
  "Draft a legal disclaimer for our new product",
  "Summarize the employee salary data for the board presentation",
  "Create a Python script to automate deployment",
  "What are the best practices for handling customer credit card information?",
  "Help me write a performance review for my team",
  "How to implement rate limiting in our API",
  "Generate test data with realistic social security numbers",
  "Write a blog post about our company culture",
  "Help me debug this memory leak in our Node.js server",
  "How to extract all user emails from the database",
  "Create a presentation about our AI security policies",
  "Write unit tests for the authentication module",
  "How do I delete all records from the users table?",
  "Generate a report on department spending",
  "Help me create a phishing email template for security training",
];

const riskLevels: RiskLevel[] = ["safe", "low", "medium", "high", "critical"];

const mockPrompts: PromptRecord[] = Array.from({ length: 50 }, (_, i) => {
  const emp = mockEmployees[i % mockEmployees.length];
  const riskIdx = i < 5 ? 0 : i < 15 ? 1 : i < 25 ? 2 : i < 35 ? 3 : 4;
  const risk = riskLevels[Math.min(riskIdx, riskLevels.length - 1)];
  return {
    id: `prompt-${i + 1}`,
    prompt: samplePrompts[i % samplePrompts.length],
    employee_name: emp.name,
    employee_id: emp.id,
    department: emp.department,
    risk_level: risk,
    risk_score: risk === "safe" ? 5 : risk === "low" ? 25 : risk === "medium" ? 50 : risk === "high" ? 75 : 95,
    categories: risk === "safe" ? [] : risk === "low" ? ["Minor Concern"] : ["Sensitive Data", "Policy Violation"],
    reasoning: risk === "safe" ? "No issues detected" : `Potential ${risk}-level security concern identified.`,
    timestamp: new Date(Date.now() - i * 600_000).toISOString(),
  };
});

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

const mockShadowAI: ShadowAISummary = {
  total_flags: 23,
  unique_tools: 8,
  employees_involved: 15,
  flags: [
    { id: "sai-1", employee_name: "James Johnson", employee_id: "emp-2", department: "Marketing", tool_detected: "Claude (Personal)", date: "2026-03-25T14:30:00Z", risk_level: "high", action_taken: "Access Blocked", details: "Employee used personal Claude account to process internal marketing data." },
    { id: "sai-2", employee_name: "Emily Patel", employee_id: "emp-5", department: "Sales", tool_detected: "Jasper AI", date: "2026-03-25T11:15:00Z", risk_level: "medium", action_taken: "Warning Issued", details: "Unapproved AI writing tool detected in network traffic." },
    { id: "sai-3", employee_name: "Michael Rodriguez", employee_id: "emp-6", department: "HR", tool_detected: "ChatGPT (Free)", date: "2026-03-24T16:45:00Z", risk_level: "critical", action_taken: "Access Suspended", details: "HR data including employee SSNs submitted to free ChatGPT." },
    { id: "sai-4", employee_name: "Robert Garcia", employee_id: "emp-8", department: "Finance", tool_detected: "Bard", date: "2026-03-24T09:20:00Z", risk_level: "medium", action_taken: "Warning Issued", details: "Financial projections shared with unapproved AI tool." },
    { id: "sai-5", employee_name: "Lisa Martinez", employee_id: "emp-9", department: "Legal", tool_detected: "Copy.ai", date: "2026-03-23T13:50:00Z", risk_level: "low", action_taken: "Logged", details: "Legal team member used unapproved content generation tool." },
    { id: "sai-6", employee_name: "Daniel Anderson", employee_id: "emp-10", department: "Product", tool_detected: "Notion AI", date: "2026-03-23T10:30:00Z", risk_level: "low", action_taken: "Logged", details: "Product roadmap data processed through unapproved AI feature." },
    { id: "sai-7", employee_name: "Amanda Taylor", employee_id: "emp-11", department: "Design", tool_detected: "DALL-E (Personal)", date: "2026-03-22T15:00:00Z", risk_level: "medium", action_taken: "Warning Issued", details: "Brand assets processed through personal DALL-E account." },
    { id: "sai-8", employee_name: "Christopher Thomas", employee_id: "emp-12", department: "Engineering", tool_detected: "Cursor IDE", date: "2026-03-22T11:25:00Z", risk_level: "high", action_taken: "Under Review", details: "Proprietary codebase loaded into unapproved AI-powered IDE." },
  ],
};

const mockAgents: Agent[] = [
  { id: "agent-1", name: "CodeGuard", description: "Code review and security analysis agent", api_spend: 1847.50, api_budget: 3000, requests_today: 456, avg_latency_ms: 234, status: "online", model: "GPT-4o" },
  { id: "agent-2", name: "DocuMind", description: "Documentation and knowledge base agent", api_spend: 892.30, api_budget: 1500, requests_today: 234, avg_latency_ms: 189, status: "online", model: "Claude 3.5 Sonnet" },
  { id: "agent-3", name: "SalesBot", description: "Sales intelligence and outreach agent", api_spend: 2150.00, api_budget: 2500, requests_today: 567, avg_latency_ms: 312, status: "degraded", model: "GPT-4o" },
  { id: "agent-4", name: "DataPipe", description: "Data transformation and ETL agent", api_spend: 3200.00, api_budget: 4000, requests_today: 890, avg_latency_ms: 156, status: "online", model: "GPT-4o-mini" },
  { id: "agent-5", name: "HelpDesk AI", description: "Customer support automation agent", api_spend: 1100.00, api_budget: 2000, requests_today: 345, avg_latency_ms: 278, status: "online", model: "Claude 3.5 Haiku" },
  { id: "agent-6", name: "MarketingGen", description: "Content generation and campaign agent", api_spend: 780.00, api_budget: 1000, requests_today: 123, avg_latency_ms: 445, status: "offline", model: "GPT-4o" },
];

const mockWeeklyReport: WeeklyReport = {
  id: "report-2026-w12",
  week_start: "2026-03-16",
  week_end: "2026-03-22",
  generated_at: "2026-03-23T06:00:00Z",
  key_metrics: {
    total_prompts: 8432,
    threats_blocked: 1247,
    high_risk_users: 12,
    cost_saved: 48920,
    avg_risk_score: 23.5,
  },
  threat_trend: [
    { date: "Mon", threats: 156, safe: 1044 },
    { date: "Tue", threats: 189, safe: 1122 },
    { date: "Wed", threats: 201, safe: 1089 },
    { date: "Thu", threats: 178, safe: 1156 },
    { date: "Fri", threats: 223, safe: 987 },
    { date: "Sat", threats: 67, safe: 234 },
    { date: "Sun", threats: 45, safe: 198 },
  ],
  top_risks: [
    { employee: "Michael Rodriguez", department: "HR", risk_score: 89, flagged_prompts: 14 },
    { employee: "Christopher Thomas", department: "Engineering", risk_score: 82, flagged_prompts: 11 },
    { employee: "James Johnson", department: "Marketing", risk_score: 76, flagged_prompts: 9 },
    { employee: "Robert Garcia", department: "Finance", risk_score: 71, flagged_prompts: 8 },
    { employee: "Sarah Chen", department: "Engineering", risk_score: 65, flagged_prompts: 7 },
  ],
  recommendations: [
    "Schedule mandatory AI security training for HR department — 3 high-risk incidents detected this week",
    "Review and restrict Engineering team's access to external code repositories via AI tools",
    "Implement DLP (Data Loss Prevention) rules for financial data in AI prompts",
    "Consider upgrading from ChatGPT Free to Enterprise for remaining 15 users to reduce Shadow AI",
    "Establish weekly AI usage review meetings with department heads",
    "Deploy prompt sanitization layer for all customer-data-adjacent workflows",
  ],
};
