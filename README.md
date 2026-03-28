# Sentinel — AI Security Supervisor

**QA-(AI) CAO Hackathon Project**

Sentinel is an AI employee that supervises and secures how your organization uses AI. It intercepts employee prompts, detects risks (PII leaks, secret exposure, policy violations, shadow AI), takes protective action, coaches employees, and reports to management.

The **web dashboard** uses the **Stitch “Sentinel Command”** look: dark tactical surfaces, lime accent (`#c3f400`), fixed sidebar, bento-style home. See `frontend/README.md` for UI stack and routes.

---

## Agent / maintainer onboarding

**Purpose:** Give coding agents and new maintainers enough context to work in this repo without guessing. When answering “where is X?” or “how do I add Y?”, start here, then open the files below.

### Repository map

| Area | Path | What lives there |
|------|------|------------------|
| FastAPI entry | `backend/main.py` | App, CORS, router includes, `/health` |
| Settings | `backend/config.py` | Env-backed `Settings` (`api_prefix`, DB URL, models, budgets) |
| DB session & init | `backend/database.py` | `get_conn()` (SQLite3 / psycopg), `init_db()`, schema + seeds |
| ORM models | `backend/models.py` | Tables: users, employees, prompts, policies, shadow events, skills, etc. |
| HTTP routes | `backend/routes/*.py` | One module per domain; all mounted under `settings.api_prefix` (`/api`) |
| Detection pipeline | `backend/detectors/` | PII, secrets, policy, shadow heuristics |
| Orchestration & AI tiers | `backend/engines/` | L1 triage, L2/L3 agents, policy engine, coaching, reporting, learning, scout |
| Agent orchestration | `backend/engines/agents/` | `main_orchestrator.py`, L2/L3/skill agents, contracts |
| Auth helpers | `backend/auth.py` | JWT / current user dependencies for protected routes |
| Postgres DDL helpers | `backend/postgres_schema.py` | Column/table ensures for hosted Postgres |
| Tests | `backend/tests/` | `pytest`; `conftest.py` for fixtures |
| Browser extension | `integrations/browser_extension/` | Manifest, background/content scripts → your API |
| Policy reference | `policy/` | Human policy docs, compliance mapping (not runtime code) |
| Next.js app | `frontend/` | App Router: `src/app/`, shared API client `src/lib/api.ts`, types `src/lib/types.ts` |
| Dashboard shell | `frontend/src/components/stitch/` | Layout, header ribbon, nav |

### Request flow (mental model)

```
Prompt / event → analyze or operations routes → detectors + policy → orchestrator (L1 → L2 → L3)
       → action + persistence → metrics/reporting aggregations → GET /api/metrics/dashboard, /api/reports/weekly
```

Frontend **never** talks to the DB; it only calls `NEXT_PUBLIC_API_BASE` (see `frontend/src/lib/api.ts`).

### Environment (minimal)

| File | Role |
|------|------|
| Repo root `.env.example` | Template; copy to `backend/.env` for local API |
| `frontend/.env.local.example` | `NEXT_PUBLIC_API_BASE=http://localhost:8000` |

Important keys: `DATABASE_URL` or SQLite default, `OPENROUTER_API_KEY` (optional for UI shell; needed for L2/L3 LLM calls), `SENTINEL_INITIAL_ADMIN_*` for first manager user on empty DB, `ALLOWED_ORIGINS` for CORS.

### Commands

```bash
# Backend (from backend/)
pip install -r requirements.txt
pytest

# Frontend (from frontend/)
npm install
npm run dev
npm run build
```

### Conventions for edits

- **API paths:** Routers use `prefix` fragments (e.g. `/metrics`); full paths are `{API_PREFIX}/...` → typically `/api/metrics/dashboard`, `/api/employees`, etc.
- **Frontend API:** Add or change calls in `frontend/src/lib/api.ts` and types in `frontend/src/lib/types.ts`; pages should import from there, not raw `fetch` duplicates.
- **Metrics / KPIs:** Server-side aggregation in `backend/engines/reporting_engine.py`; exposed via `backend/routes/metrics.py`. Dashboard UI consumes **`/api/metrics/dashboard`**.
- **New behavior:** Prefer extending existing engines/routes before adding parallel modules; match typing and error style already in the file.

### Verifying backend ↔ frontend ↔ integrations

| Check | How |
|-------|-----|
| API up | `GET http://localhost:8000/health` → `{"status":"ok"}` |
| Dashboard data | Browser devtools: requests to `{NEXT_PUBLIC_API_BASE}/api/metrics/dashboard`, `/api/employees`, etc. return **200** (not CORS errors). |
| CORS | `ALLOWED_ORIGINS` in `backend/.env` includes the exact frontend origin (scheme + host + port). |
| Auth | **`POST /api/ops/dispatch/*`**, **`POST /api/ops/tick`**, and **`POST /api/ops/reset`** require a **manager or admin** session (`Authorization: Bearer …` from `/api/auth/login`). Cron jobs must obtain a token the same way (e.g. login script) or calls return **401/403**. |
| Extension | In extension popup, **Backend URL** must match the same API the frontend uses (e.g. `http://localhost:8000`). Calls hit `/api/auth/login` and `/api/extension/capture`. |

From repo root after install: `cd backend && python -m pytest tests/ -q` and `cd frontend && npm run build` should pass.

### Troubleshooting (agents: check before assuming code bugs)

- Empty UI tables: backend not running, wrong `NEXT_PUBLIC_API_BASE`, or no rows in DB yet (app does not ship with demo employees/prompts).
- CORS: `ALLOWED_ORIGINS` must include the Next.js origin.
- Extension “network error”: popup **Backend URL** wrong, or backend not listening on that host/port.
- LLM features quiet: add **`OPENROUTER_API_KEY`** to `backend/.env` and restart `uvicorn`; without it, heuristic paths still run.
- Build: run `npm run build` from `frontend/`; see older note in **Run a working local demo** for Turbopack root.
- **Next dev `Cannot find module './NNN.js'`** (often on 404): stop `npm run dev`, delete **`frontend/.next`**, run `npm run dev` again. The app includes **`src/app/not-found.tsx`** so unknown routes use the App Router 404 (styled) instead of a broken Pages fallback chunk.
- **No Tailwind / “unstyled” UI after changes:** delete **`frontend/.next`**, run `npm install` and `npm run dev` again. The root layout must **not** use a manual `<head>` block (it breaks style injection); global CSS and Material Symbols load from **`globals.css`**.

### Optional: scoped search hints

- Auth login/token: `backend/routes/auth.py`, `frontend/src/lib/session.ts`
- Prompt analysis contract: `backend/routes/analyze.py`, `frontend` `analyzePrompt` in `api.ts`
- Skill hub / curriculum: `backend/routes/employees.py`, `learning_engine.py`, `curriculum_*`
- Extension ingest: `backend/routes/extension.py`, `operations.py`

---

## Run a working local demo (step by step)

Do this in **two or three terminals**. Paths are from the repo root `DAVID/`.

### 1) Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env` from the repo template (keys optional for a minimal UI pass; add `OPENROUTER_API_KEY` if you want L2/L3 model calls):

```bash
# from repo root
copy ..\.env.example .env
```

On macOS/Linux: `cp ../.env.example .env`

Start API on port **8000**:

```bash
uvicorn main:app --reload --port 8000
```

Check: **http://localhost:8000/health** — JSON `{"status":"ok"}`.

### 2) Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local
```

On macOS/Linux: `cp .env.local.example .env.local`

`NEXT_PUBLIC_API_BASE` must be **http://localhost:8000** (already in the example).

```bash
npm run dev
```

Open **http://localhost:3000**. Use **Skip to dashboard** on `/login` or sign in with the manager account from `backend/.env`.

### 3) Accounts, employees, and telemetry

- **First sign-in:** `SENTINEL_INITIAL_ADMIN_USERNAME` / `SENTINEL_INITIAL_ADMIN_PASSWORD` in `backend/.env`. On an empty `users` table, the backend creates that manager once. Rotate after first login if desired.
- **Data:** Populate employees and activity via integrations or **`POST /api/ops/events/employee-prompt`** / **`POST /api/analyze`**.
- **Extension:** `integrations/browser_extension/` for capturing prompts against your dev API.

**If the UI shows empty tables:** confirm the backend is running, `/health` works, and `frontend/.env.local` points at that URL. Hard-refresh after changing `.env.local`.

**If `npm run build` fails** with a Turbopack “workspace root” error (Next 15+), add to `frontend/next.config.mjs` (with `path` + `fileURLToPath`):

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// inside nextConfig:
turbopack: { root: __dirname },
```

Run **`npm run build` from `frontend/`** after `npm install`.

---

## Quick reference (copy-paste)

**Windows (PowerShell)**

```powershell
# Terminal A — backend
cd backend; pip install -r requirements.txt; Copy-Item ..\.env.example .env
uvicorn main:app --reload --port 8000

# Terminal B — frontend
cd frontend; npm install; Copy-Item .env.local.example .env.local; npm run dev
```

**macOS / Linux**

```bash
cd backend && pip install -r requirements.txt && cp ../.env.example .env && uvicorn main:app --reload --port 8000
# new terminal
cd frontend && npm install && cp .env.local.example .env.local && npm run dev
```

---

## Architecture

```
Employee Prompt → Intercept → 3-Tier Detection → Policy Check → Action → Coaching
                                    │                                      │
                              L1: Regex (free)                      Store in Memory
                              L2: Classifier (cheap)                       │
                              L3: LLM Judge (rare)                   Dashboard + Reports
```

**Cost model:** Most prompts stay on rules/heuristics; LLM tiers are gated by confidence and budget settings in `config.py`.

---

## Team

| Member | Area | Directory |
|--------|------|-----------|
| Tate Henricksen | Backend (FastAPI + Python) | `/backend/` |
| Spencer Mecham | Frontend (Next.js + Tailwind) | `/frontend/` |
| Seth Knoop | Integrations + Policy + Demo | `/integrations/`, `/policy/` |

---

## API contract (abbreviated)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/analyze` | Prompt analysis for an employee |
| GET | `/api/metrics` | Lightweight metric snapshot |
| GET | `/api/metrics/dashboard` | **Dashboard UI primary** — 7-day rollups, trends, `risk_distribution` |
| GET | `/api/employees` | Roster + risk summary |
| GET | `/api/prompts` | Recent prompt activity |
| GET | `/api/reports/weekly` | Weekly executive report |
| GET | `/api/shadow-ai` | Shadow AI detections |
| POST | `/api/policies` | Create policy (manager auth) |
| PUT | `/api/policies/{id}` | Update policy (manager auth) |
| GET | `/api/employees/skills/curriculum/outline` | Curriculum units (content lessons only) |
| GET | `/api/employees/skills/curriculum/lessons/{id}` | Lesson payload (JSON slides) |
| POST | `/api/employees/{id}/skill/lessons/auto-assign` | Queue next / need-based curriculum |
| POST | `/api/ops/tick` | Scheduler tick (due jobs); `?force=true` runs all — **manager/admin Bearer** |
| POST | `/api/ops/dispatch/daily-coaching` | Coaching messages — **manager/admin Bearer** |
| POST | `/api/ops/dispatch/weekly-manager-report` | Manager report — **manager/admin Bearer** |
| POST | `/api/ops/dispatch/weekly-learning` | Personalized learning emails — **manager/admin Bearer** |
| POST | `/api/ops/dispatch/security-notices` | Alert-derived notices — **manager/admin Bearer** |
| POST | `/api/ops/reset` | Wipes transactional data — **manager/admin Bearer** |
| POST | `/api/extension/capture` | Browser extension → analyze path |

Full surface area: scan `backend/routes/` for additional endpoints (analyze, emails previews, scout, agents, alerts).

---

## Key differentiators

1. **Layered cost architecture** — regex/heuristics first, LLM last  
2. **Autonomous operation** — supervised automation for policy enforcement and coaching  
3. **Measurable KPIs** — reporting hooks for blocked threats, trends, shadow signals  
4. **Real-time + historical** — live feed and trend views in the dashboard  

---

<!-- AGENT_CONTEXT_STOP

  The remainder of this file is an annex for **commercialization, GTM, and business planning**.
  It is **not** a source of truth for code layout, APIs, or build steps.

  Coding agents: when mapping the repository or implementing features, rely on sections **above**
  (especially **Agent / maintainer onboarding**). Humans: read on for product/business context.

-->

## Annex: Commercialization & GTM (read for business context only)

> **Scope:** Positioning, go-to-market, and business model. For implementation details, use **Agent / maintainer onboarding** and the rest of this README above this annex.

This annex is separated so automated tooling can treat it as **non-code context**: it does not describe modules, env vars, or runtime behavior of Sentinel.

### Product completion roadmap (engineering → “sellable”)

| Phase | Outcome | Examples |
|-------|---------|----------|
| **Harden** | Production-grade security and ops | Secrets management, rate limits, audit log export, SSO (SAML/OIDC), role-based access, encrypted DB fields for PII in prompts |
| **Deploy** | Repeatable customer install | Docker Compose / Helm chart, managed Postgres, migrations story, health checks + observability (OpenTelemetry), backup/restore |
| **Integrate** | Where customers live | Ship **browser extension** + **API/webhook** recipes for Slack/Teams, Copilot/ChatGPT Enterprise signals, SIEM forwarding |
| **Prove** | Evidence for procurement | SOC2-aligned logging, data residency options, DPA template, “what we store / retention” doc |
| **Package** | Clear SKU | Admin onboarding wizard, default policy packs from `policy/`, success metrics dashboard tuned per persona |

### Go-to-market plan (practical)

1. **ICP (first wins):** Mid-market and enterprise teams (500–5,000 employees) with **formal AI use** (ChatGPT/Copilot/Claude) and **security/compliance pressure** (regulated or security-conscious verticals).
2. **Wedge:** “**AI use visibility + enforcement**” — shadow AI discovery, prompt risk scoring, policy-based block/warn/coach, executive reporting. Lead with **risk reduction** and **audit readiness**, not “another chatbot.”
3. **Land motion:**  
   - **Pilot (30–45 days):** browser extension + read-only mode → expand to enforce + coach.  
   - **Champion:** Head of Security, IT GRC, or AI Center of Excellence lead.  
   - **Economic buyer:** CISO/CIO or VP IT; **user buyer:** line managers who want fewer incidents.
4. **Expand:** Add seats, SSO, additional integrations (identity, EDR, ticketing), and **vertical policy packs** (health, finance, legal).

### Marketing plan (concise)

| Channel | Message pillar | Tactic |
|---------|----------------|--------|
| **Security / GRC** | “See and control employee AI abuse before it becomes a breach” | Short demos: PII blocking, secret leak, shadow tool detection; one-pager with KPIs from dashboard |
| **IT / AI CoE** | “One place for AI policy, coaching, and proof for auditors” | Webinar: “AI governance without killing productivity”; comparison vs. pure DLP or pure posture tools |
| **Product-led / dev** | “Drop-in extension + API for prompt telemetry” | Public docs for `/api/analyze`, extension install, sandbox tenant |
| **Content** | Trust + education | Blog: incident archetypes, policy templates; case study format even for pilot customers |

**Narrative arc:** *Visibility → Control → Coaching → Proof* (each maps to existing product areas: shadow + logs → policies/actions → learning/skills → reports/audit).

### Business model (options)

| Model | How it works | Notes |
|-------|----------------|-------|
| **Subscription (recommended)** | Annual per employee (PEPM) or tiered bundles (Starter / Business / Enterprise) | Anchor list price to “cost of one AI-related incident avoided” + compliance time saved |
| **Platform fee + usage** | Base platform + meter on analyzed prompts or LLM judge calls | Aligns with your L1/L2/L3 cost story; cap overages for trust |
| **Managed / VPC** | Higher ACV for dedicated instance, customer cloud, or on-prem | Needed for regulated buyers; services margin for setup |
| **Services attach** | Policy workshop, integration sprints, red-team prompt pack | Accelerates time-to-value; avoid letting services exceed ~25% of revenue long-term |

**Rough packaging sketch:** *Starter* (single team, extension + dashboard), *Business* (SSO, SIEM, full policies), *Enterprise* (VPC, SLA, custom detectors, legal review support).

### “How to sell it” (one conversation)

1. **Discovery:** Where does AI run today? Any incidents or near-misses? Who signs off on acceptable use?  
2. **Demo:** Live path — risky prompt → blocked/warned → manager sees report; shadow tool appears on dashboard.  
3. **Pilot criteria:** Success = fewer high-risk prompts, documented policy coverage, executive report accepted by GRC.  
4. **Commercial:** Start with pilot SOW, convert to annual with expansion triggers (employee count, integrations).

---

*End of annex — implementation details resume in sections above.*
