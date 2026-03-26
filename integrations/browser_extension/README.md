# Sentinel Browser Extension (Starter)

This Chrome extension captures prompts from AI chat pages and sends them to Sentinel backend as the primary ingestion path.

## Features

- Employee/manager login via `POST /api/auth/login`
- Bearer token stored in extension local storage
- Main-world network capture hook for prompt payloads (`fetch`, `XMLHttpRequest`, `WebSocket`)
- Automatic prompt draft + submit capture from chat textareas/contenteditable
- Automatic 1-second screenshot capture while on supported AI pages (latest frame shown in popup)
- Automatic 1-second prompt-bar scrape while on supported AI pages
- Automatic AI output capture using DOM mutation observers
- Attachment context capture from file input, drag/drop, and paste
- Security warning + explicit confirm when backend flags risky sharing
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
7. Use `chatgpt.com`, `chat.openai.com`, `claude.ai`, or `gemini.google.com` and submit a prompt.

## Capture Trigger

- Primary: captures prompts from outbound chat request payloads at page runtime (less brittle than selector scraping).
- Every second on AI pages: captures current visible-tab screenshot + prompt-bar text, stores latest values for popup display, and sends prompt text to `/api/extension/capture` for backend analysis.
- Auto-captures while typing on supported AI websites.
- Detects submit on `Enter` (without Shift) and common send button clicks.
- Captures assistant outputs when new response text appears and stabilizes.
- Sends attachment metadata and bounded text previews for text-like files.
- Shows a warning dialog when Sentinel detects security risk; user must confirm to continue.

## Attachment Support (Phase 1)

- Captures metadata for up to 5 attachments per event.
- Extracts text preview for text-like MIME types (for security scanning).
- Does not upload raw file binaries in this phase.
- Backend validation rejects oversized attachment payloads.

## Notes

- This is a demo starter. Production hardening should include:
  - secure auth (hashed passwords, refresh tokens, revocation)
  - stricter site-specific network payload extraction maps
  - retry queue/offline buffering
- If a site changes payload shape, update parsing in `page_hook.js` (`extractPromptFromJson`).
