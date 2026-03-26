# Sentinel — AI Security Supervisor

**QA-(AI) CAO Hackathon Project**

Sentinel is an AI employee that supervises and secures how your organization uses AI. It intercepts employee prompts, detects risks (PII leaks, secret exposure, policy violations, shadow AI), takes protective action, coaches employees, and reports to management.

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example .env  # Add your API keys
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # Runs on localhost:3000
```

## Architecture

```
Employee Prompt → Intercept → 3-Tier Detection → Policy Check → Action → Coaching
                                    │                                      │
                              L1: Regex (free)                      Store in Memory
                              L2: Classifier (cheap)                       │
                              L3: LLM Judge (rare)                   Dashboard + Reports
```

**Cost Model**: ~95% of prompts handled by free regex/rules. Only 2% ever reach an LLM.

## Team

| Member | Area | Directory |
|--------|------|-----------|
| Tate Henricksen | Backend (FastAPI + Python) | `/backend/` |
| Spencer Mecham | Frontend (Next.js + Tailwind) | `/frontend/` |
| Seth Knoop | Integrations + Policy + Demo | `/integrations/`, `/policy/` |

## API Contract

- `POST /api/analyze` — Submit a prompt for analysis
- `GET /api/metrics` — Dashboard metrics
- `GET /api/employees` — Employee list with risk scores
- `GET /api/prompts` — Recent prompt activity
- `GET /api/reports/weekly` — Weekly executive report
- `GET /api/shadow-ai` — Shadow AI detections
- `GET /api/agents` — Agent budgets and performance

## Key Differentiators

1. **Layered cost architecture** — regex first, LLM last
2. **Autonomous operation** — Sentinel acts without human input
3. **Measurable KPIs** — every action mapped to cost savings and risk reduction
4. **Real-time + historical** — live feed AND trend analysis
