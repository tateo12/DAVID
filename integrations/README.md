# Sentinel Integrations

**Owner: Tate Henricksen Claude Code and Codex**

## Context for AI Assistants

This directory contains integrations and content for Sentinel, an AI Security Supervisor that intercepts prompts, detects risk, enforces policy, coaches users, and reports to management.

## Responsibilities

### 1. Browser Extension (`browser_extension/`)

Chrome-oriented capture of prompts on AI tool sites, with Sentinel intercept UX. See `browser_extension/README.md`.

### 2. Email Templates (`email/templates/`)

- `coaching.html` — coaching tone for flagged prompts
- `alert.html` — manager security alerts
- `weekly_report.html` — executive weekly summary

### 3. Report Export (`exports/`)

`generate_report.py` builds a PDF from **`--api`** (live Sentinel) or **`--json`** (saved payload). It does not embed fictional KPIs.

### 4. Terminal / proxy (`terminal/`)

Optional shell hooks and proxy for approved-tool allowlists and shadow-AI signaling. See subfolder READMEs.

## Stack

- Python for export scripts and tooling
- HTML/CSS for email templates
- JavaScript for the browser extension
- Backend API base URL configured per environment (typically `http://localhost:8000` in development)
