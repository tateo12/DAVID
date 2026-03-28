# Sentinel Browser Extension — Prompt Guard

Chrome extension that **intercepts employee AI prompts before submission** and blocks messages containing sensitive data (PII, secrets, credentials) from reaching AI tools.

## How It Works

```
Employee types prompt → Presses Enter / clicks Send
        ↓
  Event intercepted (blocked from reaching AI site)
        ↓
  Local DLP scan runs instantly (~1ms)
    ├─ CRITICAL findings → Hard block, no override
    ├─ HIGH findings → Block with "Send Anyway" option
    └─ Clean → Backend pre-check (up to 3s timeout)
            ├─ Backend flags risk → Show warning modal
            └─ Clean / timeout → Release submission
```

## Key Features

- **Pre-submission blocking** — captures and analyzes prompts *before* they reach the AI service
- **45+ AI sites covered** — ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Mistral, Poe, and many more
- **Dynamic site detection** — background script auto-detects and injects on AI sites not in the static list
- **Client-side DLP scanning** — instant regex-based detection mirroring the backend's PII and secrets detectors
- **Blocking overlay UI** — fullscreen modal showing exactly what was detected, with severity badges
- **Backend deep analysis** — server-side L1/L2/L3 analysis pipeline for policy violations beyond regex
- **Warning confirmation flow** — "Send Anyway" for non-critical findings, logged and audited
- **Network-level capture** — main-world hooks on `fetch`, `XHR`, `WebSocket` for payload-level interception
- **Output capture** — monitors AI responses via DOM mutation observers
- **Conversation scraping** — captures existing messages on page load
- **Monitoring banner** — visual indicator that Sentinel is active on the current page

## Supported AI Sites

| Provider | Domains |
|----------|---------|
| OpenAI | chatgpt.com, chat.openai.com |
| Anthropic | claude.ai |
| Google | gemini.google.com, aistudio.google.com, labs.google |
| Microsoft | copilot.microsoft.com, bing.com/chat |
| Perplexity | perplexity.ai |
| Mistral | chat.mistral.ai |
| DeepSeek | chat.deepseek.com |
| Meta | meta.ai, grok.com, x.com/i/grok |
| Poe | poe.com |
| HuggingFace | huggingface.co/chat |
| Character.AI | character.ai, beta.character.ai |
| Cohere | coral.cohere.com |
| Inflection | pi.ai |
| You.com | you.com |
| Qwen | chat.qwenlm.ai |
| Yi | chat.01.ai |
| Groq | console.groq.com |
| OpenRouter | openrouter.ai |
| Together | together.ai |
| Fireworks | app.fireworks.ai |
| DeepInfra | deepinfra.com |
| Replicate | replicate.com |
| LMSYS | chat.lmsys.org, lmarena.ai, arena.lmsys.org |
| Others | Reka, Coze, Jasper, Writesonic, Forefront, NBox |
| **Dynamic** | Any site with `/chat`, `/conversation`, `/playground`, `/ask` paths |

## What Gets Blocked

### Critical (hard block, no override)
- Social Security Numbers (XXX-XX-XXXX pattern)
- AWS access keys (AKIA...)
- API keys (sk-...)
- Database connection strings (mongodb://, postgres://, etc.)
- Private key blocks (-----BEGIN PRIVATE KEY-----)
- GitHub/Slack tokens
- References to: SSN, passport numbers, bank accounts, SSH keys, patient data

### High (block with "Send Anyway" option)
- Credit card numbers
- Passwords in key=value format
- Bearer tokens
- Secret/token values
- References to: API keys, credentials, .env files, medical records, salary, employee records

### Medium (logged, not blocked)
- Email addresses
- Phone numbers

## Quick Start

1. Start the Sentinel backend on `http://localhost:8000`
2. In Chrome, open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder
5. Open the extension popup and login:
   - Employee: `employee1 / demo123`
   - Manager: `manager1 / demo123`
6. Navigate to any supported AI site — the Sentinel banner appears at the top
7. Try typing a prompt with sensitive data and press Enter — it will be blocked

## Architecture

```
content.js          Local DLP scan + event interception + UI
    ↕ chrome.runtime.sendMessage
background.js       Auth, backend API calls, dynamic injection
    ↕ fetch
Backend API         Full L1/L2/L3 analysis pipeline

page_hook.js        Main-world fetch/XHR/WebSocket hooks
    ↕ window.postMessage
content.js          Bridges network captures to background
```

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, AI site URL list, permissions |
| `content.js` | Pre-submission interception, local DLP scanner, blocking UI |
| `background.js` | Service worker: auth, API calls, dynamic site injection |
| `page_hook.js` | Main-world network hooks (fetch/XHR/WebSocket) |
| `styles.css` | Banner, blocking overlay, toast, warning card styles |
| `popup.html` | Login popup UI |
| `popup.js` | Login/logout logic |

## Notes

- This is a demo/hackathon build. Production hardening should include:
  - Encrypted credential storage and refresh token rotation
  - Per-organization policy push for DLP pattern customization
  - Allowlist/blocklist management in admin dashboard
  - Offline queue with retry for backend-unreachable scenarios
  - CSP-safe injection for stricter sites
- The local DLP patterns intentionally mirror the backend's `pii_detector.py` and `secrets_detector.py` for consistency.
- When the backend is unreachable, local scanning still protects against obvious leaks; the submission is allowed after a 3-second timeout if local scan is clean.
