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

## Demo Prep (End-to-End)

Use this sequence so `frontend`, `backend`, and `integrations` all reflect live data:

```bash
# 1) Start backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 2) Start frontend (new terminal)
cd frontend
npm install
# optional: copy .env.local.example to .env.local and set NEXT_PUBLIC_API_BASE
npm run dev

# 3) Seed realistic demo data (new terminal)
cd integrations/demo
python seed_data.py --url http://localhost:8000 --limit 120

# 4) Optional live traffic for the presentation
python simulate_traffic.py --url http://localhost:8000 --count 20 --min-delay 1 --max-delay 2

# 5) Demo readiness check
python demo_ready_check.py --url http://localhost:8000 --analyze
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
