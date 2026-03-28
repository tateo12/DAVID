# Sentinel Backend

**Owner: Tate Henricksen (Claude Code)**

## Context for AI Assistants

This is the core engine of Sentinel, an AI Security Supervisor. It provides:

1. **3-tier detection engine** — Regex → Small Model → LLM (escalating cost)
2. **Policy engine** — Role-based rules from JSON config
3. **Action engine** — Block, allow, auto-redact, quarantine
4. **Coaching engine** — Generate tips and safe prompt alternatives
5. **Shadow AI detector** — Domain/URL matching
6. **Reporting** — KPI metrics, weekly reports, alerts
7. **Agent supervisor** — Budget allocation and quality tracking
8. **Memory store** — SQLite-backed persistent state

## Stack

- Python 3.11+
- FastAPI (web framework)
- SQLite (database)
- Anthropic SDK (LLM calls — Haiku for L2, Sonnet for L3)

## Running

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API Endpoints

All return JSON. CORS enabled for localhost:3000.

### Core
- `POST /api/analyze` — Analyze a prompt. Body: `{employee_id, prompt_text, target_tool?, metadata?}`
- Returns: `{risk_level, action, detections[], coaching_tip?, redacted_prompt?}`
- `POST /api/auth/login` — Login for employee/manager browser extension sessions
- `GET /api/auth/me` — Resolve current logged-in user from bearer token
- `POST /api/extension/capture` — Browser extension prompt ingestion (authenticated)
- `POST /api/extension/capture-turn` — Browser/desktop prompt+AI output pair ingestion (authenticated)

### Dashboard
- `GET /api/metrics` — Aggregated KPIs
- `GET /api/employees` — Employee list with risk scores
- `GET /api/employees/{id}` — Single employee detail
- `GET /api/employees/{id}/skill` — Employee prompt-skill profile (score, strengths, improvement areas)
- `GET /api/employees/{id}/memory` — 30-day employee memory snapshot (risk/skill interaction trend)
- `GET /api/employees/{id}/memory/events` — Event-level interaction memory for employee
- `GET /api/employees/skills/company` — Company-wide AI skill snapshot
- `GET /api/employees/skills/lessons` — Active micro-lessons by skill class
- `GET /api/employees/{id}/skill/lessons` — Assigned/completed lessons for employee
- `POST /api/employees/{id}/skill/lessons/assign` — Assign lesson to employee
- `POST /api/employees/{id}/skill/lessons/complete` — Mark assigned lesson complete
- `GET /api/prompts?limit=50` — Recent prompt activity
- `GET /api/prompts/{id}` — Single prompt detail

### Policy
- `GET /api/policies` — All policies
- `PUT /api/policies/{id}` — Update policy

### Reporting
- `GET /api/reports/weekly` — Latest weekly report
- `GET /api/shadow-ai` — Shadow AI detections
- `GET /api/alerts` — Active spending/risk alerts

### Always-On Operations
- `POST /api/ops/events/agent-action` — Trigger agent assessment from agent action telemetry
- `POST /api/ops/events/employee-prompt` — Trigger employee evaluation from prompt event
- `POST /api/ops/dispatch/daily-coaching` — Generate daily coaching messages for active employees
- `POST /api/ops/dispatch/weekly-manager-report` — Generate high-detail weekly manager report
- `POST /api/ops/dispatch/security-notices` — Queue security notices from active alerts
- `POST /api/ops/code-review/submit` — Review engineer code submission on submit
- `POST /api/ops/tick?force=false` — Scheduler tick: runs due jobs based on persisted intervals

### Agents
- `GET /api/agents` — Agent list with budgets
- `POST /api/agents/runs` — Log per-run cost/quality/success telemetry
- `POST /api/agents/attributions` — Attribute output profitability (revenue impact + cost saved) to agent
- `GET /api/agents/summary` — Manager-facing 7-day performance and ROI proxy
- `GET /api/agents/{id}/memory` — 30-day memory depot snapshot for agent spend/value/profitability
- `POST /api/agents/rebalance` — Auto-adjust budgets from recent performance
- `PUT /api/agents/{id}/budget` — Update agent budget

## Backend Contract Note (Integration Handoff)

Canonical enums:

- `risk_level`: `low | medium | high | critical`
- `action`: `allow | block | redact | quarantine`
- `detection.severity`: `low | medium | high | critical`
- `detection.layer`: `L1_regex | L2_classifier | L3_llm`

### `POST /api/analyze`

Request:

```json
{
  "employee_id": 1,
  "prompt_text": "Summarize: John Doe, SSN 123-45-6789",
  "target_tool": "chat.openai.com",
  "metadata": {
    "source": "simulator"
  }
}
```

Response:

```json
{
  "prompt_id": 101,
  "risk_level": "high",
  "action": "redact",
  "detections": [
    {
      "type": "pii",
      "subtype": "ssn",
      "severity": "critical",
      "detail": "Detected possible ssn.",
      "span": [26, 37],
      "confidence": 0.93,
      "layer": "L1_regex"
    }
  ],
  "coaching_tip": "Sensitive content was auto-redacted. Use generalized placeholders instead of real identifiers.",
  "redacted_prompt": "Summarize: John Doe, SSN [REDACTED_SSN]",
  "layer_used": "L1_regex",
  "confidence": 0.95,
  "estimated_cost_usd": 0.0,
  "skill_evaluation": {
    "overall_score": 0.74,
    "skill_class": "proficient",
    "dimension_scores": {
      "objective_clarity": 1.0,
      "context_richness": 0.35,
      "constraints_defined": 0.3,
      "specificity": 0.78,
      "instruction_quality": 0.5
    },
    "strengths": [
      "Clear objective is present."
    ],
    "improvements": [
      "Add business background and intended audience.",
      "Specify output format, tone, and length constraints."
    ],
    "coaching_message": "Improve clarity, context, and output constraints to raise answer quality and reduce retries."
  }
}
```

Skill classes:

- `novice` — needs prompt basics and safety fundamentals
- `developing` — learning consistency and constraints
- `proficient` — producing reliable prompts with context
- `advanced` — optimizing workflows and reusable prompt patterns

### Query params

- `GET /api/prompts?limit=50` where `limit` is `1..500`

### Error contract

- 4xx input/resource errors:
  - `{ "detail": "<error message>" }`
- 5xx server errors:
  - `{ "detail": "Internal Server Error" }`

### Browser Extension Auth Flow

1. `POST /api/auth/login` with your org credentials (configure `SENTINEL_INITIAL_ADMIN_USERNAME` / `SENTINEL_INITIAL_ADMIN_PASSWORD` in `backend/.env` for the first manager on an empty database).

```json
{
  "username": "admin",
  "password": "your-secure-password"
}
```

2. Save `access_token` in extension local storage.
3. Call `POST /api/extension/capture` with header:
   - `Authorization: Bearer <access_token>`

Employee capture request:

```json
{
  "prompt_text": "Draft a reply to this customer issue...",
  "target_tool": "chat.openai.com",
  "metadata": {
    "tab_url": "https://chat.openai.com/",
    "client_ts": "2026-03-26T15:00:00Z"
  }
}
```

Manager capture request (for audits/simulation):

```json
{
  "employee_id": 1,
  "prompt_text": "What are this quarter's confidential pipeline details?",
  "target_tool": "unknown-ai.example"
}
```

## Detection Return Format

```python
@dataclass
class Detection:
    type: str          # "pii", "secret", "policy", "shadow_ai"
    subtype: str       # "ssn", "api_key", "confidential_project", etc.
    severity: str      # "low", "medium", "high", "critical"
    detail: str        # Human-readable description
    span: tuple[int, int]  # Character positions in original text
    confidence: float  # 0.0 to 1.0
    layer: str         # "L1_regex", "L2_classifier", "L3_llm"
```

## Architecture Rules

- Regex first, LLM last — always try the cheapest detection first
- Every action is logged to SQLite
- Config comes from environment variables via config.py
- No external databases — SQLite only
- Keep functions under 50 lines
