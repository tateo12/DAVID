# Sentinel Integrations

**Owner: Seth Knoop (ChatGPT + Copilot + Antigravity)**

## Context for AI Assistants

This directory contains integrations, demo infrastructure, and content for Sentinel, an AI Security Supervisor.

## Responsibilities

### 1. Demo Data (`demo/`)
- `sample_prompts.json` — 50+ realistic employee prompts covering: safe usage, PII leaks, secret exposure, policy violations, shadow AI, and edge cases
- `seed_data.py` — Script that replays sample prompts through backend API events (`/api/ops/events/employee-prompt`) and runs scheduler tick
- `simulate_traffic.py` — Async traffic script for live prompt events and ops tick
- `desktop_connector_mock.py` — Mock desktop AI connector that posts Copilot-style prompt/output turns into Sentinel
- `api_client.py` — Shared minimal API client for integration scripts

### 2. Email Templates (`email/templates/`)
- `coaching.html` — Email sent to employees when flagged (friendly, constructive tone)
- `alert.html` — Security alert to managers (urgent, clear)
- `weekly_report.html` — Executive weekly summary (professional, data-rich)
- All templates: HTML with inline CSS, responsive, professional design

### 3. Browser Extension (`browser_extension/`)
- Chrome extension simulator that shows Sentinel intercepting prompts on AI tool websites
- Even a mockup/demo version is fine — this is for presentation impact
- Shows a small overlay when an employee types a risky prompt
- Starter implementation now includes:
  - popup login to backend (`/api/auth/login`)
  - employee/manager bearer session usage
  - prompt capture relay to backend (`/api/extension/capture`)

### 4. Report Export (`exports/`)
- PDF generation for weekly reports using a Python library
- Executive-friendly formatting with charts and KPIs
- `generate_report.py --api http://localhost:8000` now transforms live Sentinel API responses into report format

## Stack

- Python for scripts
- HTML/CSS for email templates
- JavaScript for browser extension
- Backend API at localhost:8000

## Sample Prompts Format

```json
{
  "prompts": [
    {
      "employee_id": 1,
      "text": "Summarize this customer complaint: John Smith, SSN 123-45-6789...",
      "target_tool": "ChatGPT",
      "expected_risk": "high",
      "expected_detections": ["pii_ssn", "pii_name"]
    }
  ]
}
```

## Demo Script

The demo should show:
1. Dashboard with live metrics (pre-seeded data)
2. An employee submitting a risky prompt → Sentinel catches it in real-time
3. Auto-redacted version generated
4. Coaching tip displayed
5. Employee risk score updates
6. Shadow AI detection example
7. Weekly report generation
8. Cost savings highlighted

## Design Notes for Templates

- Company branding: "Sentinel" with shield icon
- Color scheme: navy + electric blue + white
- Professional but modern tone
- Coaching emails should be encouraging, not punitive
