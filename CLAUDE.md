# Sentinel — AI Context for Claude Code

## Project

Sentinel is an AI Security Supervisor built for a hackathon. It monitors employee AI usage, detects security risks, enforces policy, coaches employees, and reports to management.

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLite, Anthropic SDK (Claude Haiku for L2 classification, Sonnet for L3 judgment)
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Shadcn UI, Recharts
- **Integrations**: HTML email templates, PDF reports, Chrome extension simulator

## Architecture Principles

1. **Cost efficiency is paramount** — Use regex/rules for 90%+ of detection. Only call LLMs when deterministic methods are uncertain.
2. **Layered detection**: L1 (regex, free) → L2 (Haiku, ~$0.001) → L3 (Sonnet, ~$0.01)
3. **SQLite for everything** — No external database needed
4. **Keep it simple** — This must be built in 7 hours by 3 people

## File Ownership

- `/backend/` — Tate (Claude Code)
- `/frontend/` — Spencer (Cursor)
- `/integrations/` and `/policy/` — Seth (ChatGPT + Copilot)

## API Design

All endpoints prefixed with `/api/`. JSON request/response. CORS enabled for localhost:3000.

## Key Detection Patterns

- PII: SSN, credit cards, emails, phone numbers, addresses
- Secrets: API keys, passwords, tokens, connection strings
- Policy: confidential project names, internal URLs, customer data
- Shadow AI: unauthorized AI tool domains

## When Editing Backend Code

- Keep functions small and focused
- Every detection function returns a standardized `Detection` dataclass
- All database access goes through `database.py`
- Config via environment variables loaded in `config.py`
