# Sentinel Frontend

**Owner: Seth Knoop (ChatGPT + Copilot + Antigravity)**

## Context for AI Assistants

This is the dashboard UI for Sentinel, an AI Security Supervisor. It visualizes:

1. **Real-time threat feed** — Live stream of analyzed prompts with risk indicators
2. **Employee risk scores** — Table + detail views with risk gauges
3. **KPI dashboard** — Threats blocked, cost saved, shadow AI detected, active employees
4. **Policy management** — View and edit AI usage policies
5. **Shadow AI monitoring** — Flagged unauthorized AI tool usage
6. **Agent budgets** — API spending per supervised agent
7. **Weekly reports** — Executive summaries with charts
8. **Coaching panel** — Tips and alternative prompts shown to employees

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Shadcn UI (component library)
- Recharts (charts)
- Lucide React (icons)

## Setup

```bash
npm install
npm run dev  # localhost:3000
```

## Backend API

Backend runs at `localhost:8000`. All endpoints prefixed with `/api/`.

Key endpoints to consume:
- `POST /api/analyze` — Submit prompt (for demo simulator)
- `GET /api/metrics` — Dashboard numbers
- `GET /api/employees` — Employee list
- `GET /api/prompts?limit=50` — Recent activity
- `GET /api/reports/weekly` — Weekly report data
- `GET /api/shadow-ai` — Shadow AI flags
- `GET /api/agents` — Agent budgets

## Design Direction

- **Dark theme** with accent colors: deep navy (#0f172a) background, electric blue (#3b82f6) accents, red (#ef4444) for threats, green (#22c55e) for safe
- **Security operations center** aesthetic — think Datadog or CrowdStrike dashboards
- Sidebar navigation with icons
- Cards with subtle glassmorphism effect
- Animated threat feed (new items slide in)
- Risk gauges use circular progress indicators
- Charts: area charts for trends, bar charts for comparisons, donut for distribution

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard with KPI cards + threat feed + charts |
| `/employees` | Employee table with risk scores, click for detail |
| `/prompts` | Full prompt history with filters |
| `/policies` | Policy viewer/editor |
| `/shadow-ai` | Shadow AI detection log |
| `/agents` | Agent budget and performance |
| `/reports` | Weekly executive reports |

## Component Patterns

- Use Shadcn `Card`, `Table`, `Badge`, `Button` as base components
- Custom `MetricCard` for KPI display (icon, value, label, trend arrow)
- Custom `RiskGauge` for circular risk indicators
- Custom `ThreatFeed` for real-time scrolling list
- All API calls go through `lib/api.ts`
- Types shared in `lib/types.ts`
