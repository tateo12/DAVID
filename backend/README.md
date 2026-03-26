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

### Dashboard
- `GET /api/metrics` — Aggregated KPIs
- `GET /api/employees` — Employee list with risk scores
- `GET /api/employees/{id}` — Single employee detail
- `GET /api/prompts?limit=50` — Recent prompt activity
- `GET /api/prompts/{id}` — Single prompt detail

### Policy
- `GET /api/policies` — All policies
- `PUT /api/policies/{id}` — Update policy

### Reporting
- `GET /api/reports/weekly` — Latest weekly report
- `GET /api/shadow-ai` — Shadow AI detections
- `GET /api/alerts` — Active spending/risk alerts

### Agents
- `GET /api/agents` — Agent list with budgets
- `PUT /api/agents/{id}/budget` — Update agent budget

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
