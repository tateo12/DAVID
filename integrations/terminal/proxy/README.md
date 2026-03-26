# Sentinel HTTPS Proxy

Network-level monitoring of AI API traffic. This mitmproxy addon intercepts outbound HTTPS requests to AI services, scans prompts for sensitive data (PII, secrets, internal URLs), and takes action based on risk level — from logging to blocking.

This is the most comprehensive layer of Sentinel's defense: unlike shell hooks that only catch CLI usage, the proxy monitors **all** HTTP(S) traffic regardless of which tool, library, or application generates it.

## Prerequisites

```bash
pip install mitmproxy pyyaml
```

Requires Python 3.11+ and mitmproxy 10+.

## Quick Start

```bash
# 1. Start the proxy
cd integrations/terminal/proxy
chmod +x launch.sh
./launch.sh

# 2. In another terminal, configure your shell to use the proxy
export HTTPS_PROXY=http://localhost:8080
export HTTP_PROXY=http://localhost:8080

# 3. Test with a curl request (will be intercepted and scanned)
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-test" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

## Configuration

Edit `config.yaml` in this directory:

| Key | Description | Default |
|-----|-------------|---------|
| `mode` | Enforcement: `log-only`, `warn`, `block` | `warn` |
| `monitored_domains` | AI API domains to intercept | See file |
| `approved_tools` | Company-approved AI services | Anthropic, OpenAI |
| `risk_actions` | Action per risk level | low=pass, med/high=warn, critical=block |
| `log_file` | Persistent audit log path | `~/.sentinel/proxy.log` |
| `sentinel_api` | Backend URL for event reporting | `http://localhost:8000` |

## Trusting the CA Certificate

mitmproxy generates its own CA certificate to decrypt HTTPS traffic. You must trust this certificate for transparent interception.

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ./certs/mitmproxy-ca-cert.pem
```

### Linux (Debian/Ubuntu)

```bash
sudo cp ./certs/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy.crt
sudo update-ca-certificates
```

### Per-Application Trust

Some tools need explicit certificate configuration:

```bash
# Python (requests, httpx)
export REQUESTS_CA_BUNDLE=./certs/mitmproxy-ca-cert.pem

# Node.js
export NODE_EXTRA_CA_CERTS=./certs/mitmproxy-ca-cert.pem

# curl
curl --cacert ./certs/mitmproxy-ca-cert.pem ...
```

## Proxy Modes

```bash
./launch.sh                        # mitmdump: headless, best for daemon/CI
./launch.sh --mode mitmproxy       # Interactive TUI with live traffic view
./launch.sh --mode mitmweb         # Web UI at http://localhost:8081
./launch.sh --port 9090            # Custom listen port
```

## Supported AI APIs

The proxy monitors and extracts prompts from these services:

- **OpenAI** (`api.openai.com`) — messages array format
- **Anthropic** (`api.anthropic.com`) — messages array with content blocks
- **Mistral** (`api.mistral.ai`) — messages array format
- **Google Gemini** (`generativelanguage.googleapis.com`) — contents/parts format
- **Cohere** (`api.cohere.ai`) — message/prompt fields
- **Together AI** (`api.together.xyz`) — messages array format
- **Replicate** (`api.replicate.com`) — generic extraction
- **Perplexity** (`api.perplexity.ai`) — messages array format
- **DeepSeek** (`api.deepseek.com`) — messages array format

## What Gets Detected

| Category | Pattern | Severity |
|----------|---------|----------|
| SSN | `XXX-XX-XXXX` | Critical |
| Credit Card | 16-digit card numbers | Critical |
| API Keys | `sk-`, `AKIA`, `ghp_`, etc. | Critical |
| Connection Strings | `postgres://`, `mongodb://`, etc. | Critical |
| Passwords | `password=...`, `secret=...` | High |
| Internal URLs | `*.internal.*` or private IPs | High |
| Email Dumps | 3+ email addresses in one prompt | Medium |
| Shadow AI | Unapproved AI service usage | High |

## How Blocking Works

When a request is classified as `critical` risk (or `high` when mode is `block`), the proxy intercepts the request before it reaches the AI service and returns:

```json
{
  "error": "Request blocked by Sentinel AI Security",
  "reason": "Detected sensitive data in prompt",
  "detections": [...],
  "risk_level": "critical",
  "policy": "Remove sensitive data and retry"
}
```

The original request never leaves the network. The employee sees an HTTP 403 response with clear instructions on what was detected and how to fix it.

## Shadow AI Detection

Any AI API domain in `monitored_domains` that is NOT in `approved_tools` is flagged as shadow AI (unauthorized AI tool usage). This is logged with `high` severity regardless of prompt content, and reported to the Sentinel backend for management dashboards.

Example: If an employee routes traffic through `api.deepseek.com` but only `api.openai.com` and `api.anthropic.com` are approved, the request is flagged even if the prompt is clean.

## Response Headers

All responses from monitored AI APIs are annotated with:

| Header | Value |
|--------|-------|
| `X-Sentinel-Scanned` | `true` |
| `X-Sentinel-Risk` | `low` / `medium` / `high` / `critical` |
| `X-Sentinel-Detections` | Count of findings |
| `X-Sentinel-Cost-Estimate` | Estimated USD cost of the API call |
| `X-Sentinel-Warnings` | Details if risk >= medium |

## Logs

All scan events are written to `~/.sentinel/proxy.log` with structured fields:

```
2026-03-26T14:30:00+0000 | WARNING  | SCAN | host=api.openai.com | risk=high | detections=2 | action=warn
```

Session summaries (total scanned, threats, blocks) are printed on shutdown and logged to the same file.
