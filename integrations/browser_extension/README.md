# Sentinel Browser Extension (Starter)

This Chrome extension captures prompts from AI chat pages and sends them to Sentinel backend as the primary ingestion path.

## Features

- Employee/manager login via `POST /api/auth/login`
- Bearer token stored in extension local storage
- Automatic prompt draft + submit capture from chat textareas/contenteditable
- Automatic AI output capture using DOM mutation observers
- Prompt submission to `POST /api/extension/capture`
- Prompt+output turn submission to `POST /api/extension/capture-turn`

## Quick Start

1. Start backend on `http://localhost:8000`
2. In Chrome, open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this folder: `integrations/browser_extension/`
6. Open the extension popup and login:
   - employee: `employee1 / demo123`
   - manager: `manager1 / demo123`

## Capture Trigger

- Auto-captures while typing on supported AI websites.
- Detects submit on `Enter` (without Shift) and common send button clicks.
- Captures assistant outputs when new response text appears and stabilizes.

## Notes

- This is a demo starter. Production hardening should include:
  - secure auth (hashed passwords, refresh tokens, revocation)
  - stricter site-specific prompt extraction
  - retry queue/offline buffering
