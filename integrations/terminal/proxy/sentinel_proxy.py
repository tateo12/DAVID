"""
Sentinel HTTPS Proxy Addon for mitmproxy
=========================================
Intercepts outbound HTTPS requests to AI API endpoints and scans prompts
for sensitive data (PII, secrets, internal URLs). Actions range from
logging to blocking depending on risk level and config.

Usage:
    mitmdump -s sentinel_proxy.py --listen-port 8080
    mitmproxy -s sentinel_proxy.py --listen-port 8080   # interactive TUI
    mitmweb -s sentinel_proxy.py --listen-port 8080      # web UI
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from mitmproxy import ctx, http

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config.yaml"

DEFAULT_CONFIG = {
    "sentinel_api": "http://localhost:8000",
    "mode": "warn",
    "monitored_domains": [
        "api.openai.com",
        "api.anthropic.com",
        "api.mistral.ai",
        "generativelanguage.googleapis.com",
        "api.cohere.ai",
        "api.together.xyz",
    ],
    "approved_tools": [
        "api.anthropic.com",
        "api.openai.com",
    ],
    "risk_actions": {
        "low": "pass",
        "medium": "warn",
        "high": "warn",
        "critical": "block",
    },
    "log_file": "~/.sentinel/proxy.log",
    "log_level": "INFO",
    "cost_per_1k_tokens": {
        "api.openai.com": 0.03,
        "api.anthropic.com": 0.015,
        "api.mistral.ai": 0.004,
        "default": 0.01,
    },
}

# ANSI colours for console output
_COLORS = {
    "reset": "\033[0m",
    "red": "\033[91m",
    "yellow": "\033[93m",
    "green": "\033[92m",
    "cyan": "\033[96m",
    "bold": "\033[1m",
    "dim": "\033[2m",
}

# ---------------------------------------------------------------------------
# Detection patterns
# ---------------------------------------------------------------------------

DETECTION_PATTERNS: list[dict[str, Any]] = [
    {
        "name": "ssn",
        "type": "pii",
        "subtype": "ssn",
        "severity": "critical",
        "pattern": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        "detail": "Social Security Number detected",
    },
    {
        "name": "credit_card",
        "type": "pii",
        "subtype": "credit_card",
        "severity": "critical",
        "pattern": re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        "detail": "Credit card number detected",
    },
    {
        "name": "api_key",
        "type": "secret",
        "subtype": "api_key",
        "severity": "critical",
        "pattern": re.compile(
            r"\b(sk-|sk_live_|sk_test_|AKIA|ghp_|xoxb-|xapp-|whsec_)"
            r"[A-Za-z0-9_-]{10,}\b"
        ),
        "detail": "API key or secret token detected",
    },
    {
        "name": "password",
        "type": "secret",
        "subtype": "password",
        "severity": "high",
        "pattern": re.compile(
            r"(?:password|passwd|pwd|secret)\s*[:=]\s*\S+", re.IGNORECASE
        ),
        "detail": "Password or secret value detected",
    },
    {
        "name": "connection_string",
        "type": "secret",
        "subtype": "connection_string",
        "severity": "critical",
        "pattern": re.compile(
            r"(?:postgres|mysql|redis|mongodb|amqp)://\S+"
        ),
        "detail": "Database connection string detected",
    },
    {
        "name": "email_dump",
        "type": "pii",
        "subtype": "email_dump",
        "severity": "medium",
        "pattern": re.compile(
            r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        ),
        "detail": "Bulk email addresses detected",
        "threshold": 3,  # need 3+ matches to trigger
    },
    {
        "name": "internal_url_domain",
        "type": "policy",
        "subtype": "internal_url",
        "severity": "high",
        "pattern": re.compile(r"https?://[^/]*\.internal\.\S+"),
        "detail": "Internal domain URL detected",
    },
    {
        "name": "internal_url_ip",
        "type": "policy",
        "subtype": "internal_url",
        "severity": "high",
        "pattern": re.compile(
            r"https?://(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\S+"
        ),
        "detail": "Internal/private IP URL detected",
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_config() -> dict:
    """Load config.yaml from the same directory as this script."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r") as fh:
            user_cfg = yaml.safe_load(fh) or {}
        # Merge with defaults so missing keys don't crash us
        merged = {**DEFAULT_CONFIG, **user_cfg}
        # Ensure nested dicts are merged
        for key in ("risk_actions", "cost_per_1k_tokens"):
            if key in user_cfg and isinstance(user_cfg[key], dict):
                merged[key] = {**DEFAULT_CONFIG.get(key, {}), **user_cfg[key]}
        return merged
    ctx.log.warn(f"[Sentinel] Config not found at {CONFIG_PATH}, using defaults")
    return dict(DEFAULT_CONFIG)


def _setup_file_logger(log_file: str, log_level: str) -> logging.Logger:
    """Create a file logger for persistent audit trail."""
    log_path = Path(log_file).expanduser()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("sentinel.proxy")
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Avoid duplicate handlers on reload
    if not logger.handlers:
        fh = logging.FileHandler(str(log_path))
        fh.setLevel(logging.DEBUG)
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
        fh.setFormatter(formatter)
        logger.addHandler(fh)

    return logger


def _colorize(text: str, color: str) -> str:
    return f"{_COLORS.get(color, '')}{text}{_COLORS['reset']}"


def _get_user() -> str:
    """Best-effort current OS username."""
    try:
        return os.getlogin()
    except OSError:
        import getpass
        return getpass.getuser()


# ---------------------------------------------------------------------------
# Main addon
# ---------------------------------------------------------------------------


class SentinelProxy:
    """mitmproxy addon that scans AI API traffic for sensitive data."""

    # ---- lifecycle --------------------------------------------------------

    def __init__(self) -> None:
        self.config: dict = {}
        self.logger: logging.Logger | None = None
        self.monitored_domains: set[str] = set()
        self.approved_tools: set[str] = set()
        self.risk_actions: dict[str, str] = {}
        self.cost_map: dict[str, float] = {}

        # Session stats
        self.stats = {
            "requests_scanned": 0,
            "threats_detected": 0,
            "requests_blocked": 0,
            "shadow_ai_detected": 0,
            "session_start": datetime.now(timezone.utc).isoformat(),
        }

    def load(self, loader) -> None:  # noqa: ANN001 (mitmproxy typing)
        """Called when the addon is loaded. Register custom options."""
        loader.add_option(
            name="sentinel_mode",
            typespec=str,
            default="warn",
            help="Sentinel enforcement mode: log-only | warn | block",
        )
        loader.add_option(
            name="sentinel_api",
            typespec=str,
            default="http://localhost:8000",
            help="URL of the Sentinel backend API",
        )

        # Load config file
        self.config = _load_config()

        # Apply CLI overrides if set
        # (options aren't available yet in load(), we'll check in configure())

        self._apply_config()

    def configure(self, updated: set[str]) -> None:
        """Called when options change (including initial setup)."""
        if "sentinel_mode" in updated:
            mode = ctx.options.sentinel_mode
            if mode in ("log-only", "warn", "block"):
                self.config["mode"] = mode
                ctx.log.info(f"[Sentinel] Mode set to: {mode}")
        if "sentinel_api" in updated:
            self.config["sentinel_api"] = ctx.options.sentinel_api

    def done(self) -> None:
        """Called on shutdown. Print session summary."""
        summary = (
            f"\n{'='*60}\n"
            f"  SENTINEL PROXY SESSION SUMMARY\n"
            f"{'='*60}\n"
            f"  Session start : {self.stats['session_start']}\n"
            f"  Session end   : {datetime.now(timezone.utc).isoformat()}\n"
            f"  Requests scanned   : {self.stats['requests_scanned']}\n"
            f"  Threats detected   : {self.stats['threats_detected']}\n"
            f"  Requests blocked   : {self.stats['requests_blocked']}\n"
            f"  Shadow AI detected : {self.stats['shadow_ai_detected']}\n"
            f"{'='*60}\n"
        )
        ctx.log.info(summary)
        if self.logger:
            self.logger.info(
                "SESSION_END | scanned=%d threats=%d blocked=%d shadow_ai=%d",
                self.stats["requests_scanned"],
                self.stats["threats_detected"],
                self.stats["requests_blocked"],
                self.stats["shadow_ai_detected"],
            )

    # ---- internal setup ---------------------------------------------------

    def _apply_config(self) -> None:
        """Populate internal state from the loaded config dict."""
        self.monitored_domains = set(self.config.get("monitored_domains", []))
        self.approved_tools = set(self.config.get("approved_tools", []))
        self.risk_actions = self.config.get("risk_actions", DEFAULT_CONFIG["risk_actions"])
        self.cost_map = self.config.get("cost_per_1k_tokens", DEFAULT_CONFIG["cost_per_1k_tokens"])

        self.logger = _setup_file_logger(
            self.config.get("log_file", "~/.sentinel/proxy.log"),
            self.config.get("log_level", "INFO"),
        )

        ctx.log.info(
            _colorize("[Sentinel] Proxy loaded", "cyan")
            + f" | monitoring {len(self.monitored_domains)} domains"
            + f" | mode={self.config.get('mode', 'warn')}"
        )

    # ---- mitmproxy hooks --------------------------------------------------

    def request(self, flow: http.HTTPFlow) -> None:
        """Intercept outbound requests to monitored AI APIs."""
        host = flow.request.host

        # Only process monitored domains
        if host not in self.monitored_domains:
            return

        self.stats["requests_scanned"] += 1
        endpoint = flow.request.pretty_url
        user = _get_user()
        timestamp = datetime.now(timezone.utc).isoformat()

        # --- Shadow AI check -----------------------------------------------
        is_shadow_ai = host not in self.approved_tools
        if is_shadow_ai:
            self.stats["shadow_ai_detected"] += 1
            self._log(
                "SHADOW_AI",
                host=host,
                endpoint=endpoint,
                user=user,
                risk="high",
                detail=f"Unapproved AI tool: {host}",
                action="flagged",
            )
            ctx.log.warn(
                _colorize("[Sentinel] SHADOW AI", "red")
                + f" | {host} is NOT an approved AI tool"
            )

        # --- Extract and scan prompt ---------------------------------------
        body_text = flow.request.get_text()
        if not body_text:
            self._log(
                "SCAN",
                host=host,
                endpoint=endpoint,
                user=user,
                risk="low",
                detail="No request body to scan",
                action="pass",
            )
            return

        try:
            body = json.loads(body_text)
        except (json.JSONDecodeError, ValueError):
            # Not JSON — scan raw text
            body = None

        if body is not None:
            prompt = self.extract_prompt(host, body)
        else:
            prompt = body_text

        detections = self.scan(prompt)

        # Shadow AI adds its own detection entry
        if is_shadow_ai:
            detections.append({
                "type": "policy",
                "subtype": "shadow_ai",
                "severity": "high",
                "detail": f"Unapproved AI service: {host}",
                "match": host,
            })

        risk = self._calculate_risk(detections)
        action = self._resolve_action(risk)

        # Override to block if global mode is "block" and risk >= high
        global_mode = self.config.get("mode", "warn")
        if global_mode == "block" and risk in ("high", "critical"):
            action = "block"
        elif global_mode == "log-only":
            action = "pass"

        # --- Execute action ------------------------------------------------
        if action == "block":
            self.stats["requests_blocked"] += 1
            detection_summaries = [
                {"type": d["type"], "subtype": d["subtype"], "detail": d["detail"]}
                for d in detections
            ]
            block_body = json.dumps(
                {
                    "error": "Request blocked by Sentinel AI Security",
                    "reason": "Detected sensitive data in prompt",
                    "detections": detection_summaries,
                    "risk_level": risk,
                    "policy": "Remove sensitive data and retry",
                },
                indent=2,
            )
            flow.response = http.Response.make(
                403,
                block_body.encode("utf-8"),
                {"Content-Type": "application/json", "X-Sentinel-Blocked": "true"},
            )
            ctx.log.error(
                _colorize("[Sentinel] BLOCKED", "red")
                + f" | {host}{flow.request.path}"
                + f" | risk={risk} | detections={len(detections)}"
            )
        elif action == "warn":
            # Stash detections for response annotation
            flow.metadata["sentinel_detections"] = detections
            flow.metadata["sentinel_risk"] = risk
            ctx.log.warn(
                _colorize("[Sentinel] WARNING", "yellow")
                + f" | {host}{flow.request.path}"
                + f" | risk={risk} | detections={len(detections)}"
            )
        else:
            # pass — just log
            flow.metadata["sentinel_detections"] = detections
            flow.metadata["sentinel_risk"] = risk
            if detections:
                ctx.log.info(
                    _colorize("[Sentinel] LOGGED", "dim")
                    + f" | {host}{flow.request.path}"
                    + f" | risk={risk} | detections={len(detections)}"
                )

        if detections:
            self.stats["threats_detected"] += len(detections)

        # --- Persistent log ------------------------------------------------
        self._log(
            "SCAN",
            host=host,
            endpoint=endpoint,
            user=user,
            risk=risk,
            detail=f"{len(detections)} detection(s)",
            action=action,
            detections=detections,
        )

        # --- Report to backend (non-blocking) ------------------------------
        self._report_event_async(
            timestamp=timestamp,
            user=user,
            host=host,
            endpoint=endpoint,
            risk=risk,
            action=action,
            detections=detections,
            is_shadow_ai=is_shadow_ai,
        )

    def response(self, flow: http.HTTPFlow) -> None:
        """Annotate responses with Sentinel headers."""
        if flow.response is None:
            return

        # Only annotate monitored domains
        if flow.request.host not in self.monitored_domains:
            return

        detections = flow.metadata.get("sentinel_detections", [])
        risk = flow.metadata.get("sentinel_risk", "low")

        flow.response.headers["X-Sentinel-Scanned"] = "true"
        flow.response.headers["X-Sentinel-Risk"] = risk
        flow.response.headers["X-Sentinel-Detections"] = str(len(detections))

        # Estimate token cost from response content-length
        cost_estimate = self._estimate_cost(flow)
        if cost_estimate is not None:
            flow.response.headers["X-Sentinel-Cost-Estimate"] = f"${cost_estimate:.6f}"

        # If action was warn, inject warning headers per detection
        if risk in ("medium", "high", "critical") and detections:
            warnings = "; ".join(d["detail"] for d in detections[:5])
            flow.response.headers["X-Sentinel-Warnings"] = warnings

    # ---- prompt extraction ------------------------------------------------

    def extract_prompt(self, host: str, body: dict) -> str:
        """
        Extract user prompt text from API-specific JSON payload formats.

        Supports OpenAI, Anthropic, Cohere, Gemini, and generic formats.
        Falls back to recursive string extraction.
        """
        try:
            # OpenAI / Anthropic / Together / Mistral — messages array
            if "messages" in body:
                parts = []
                for msg in body["messages"]:
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        parts.append(content)
                    elif isinstance(content, list):
                        # Anthropic content blocks / OpenAI multimodal
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                parts.append(block.get("text", ""))
                            elif isinstance(block, str):
                                parts.append(block)
                return "\n".join(parts)

            # Cohere
            if "message" in body and isinstance(body["message"], str):
                return body["message"]
            if "prompt" in body and isinstance(body["prompt"], str):
                return body["prompt"]

            # Google Gemini
            if "contents" in body and isinstance(body["contents"], list):
                try:
                    return body["contents"][-1]["parts"][-1]["text"]
                except (KeyError, IndexError, TypeError):
                    pass

            # Fallback: recursively extract all string values
            return self._recursive_strings(body)

        except Exception:
            return self._recursive_strings(body)

    @staticmethod
    def _recursive_strings(obj: Any, depth: int = 0, max_depth: int = 10) -> str:
        """Recursively extract all string values from a nested structure."""
        if depth > max_depth:
            return ""
        parts: list[str] = []
        if isinstance(obj, str):
            parts.append(obj)
        elif isinstance(obj, dict):
            for v in obj.values():
                parts.append(SentinelProxy._recursive_strings(v, depth + 1, max_depth))
        elif isinstance(obj, (list, tuple)):
            for item in obj:
                parts.append(SentinelProxy._recursive_strings(item, depth + 1, max_depth))
        return "\n".join(p for p in parts if p)

    # ---- detection engine -------------------------------------------------

    def scan(self, text: str) -> list[dict[str, str]]:
        """Run all detection patterns against the given text."""
        if not text:
            return []

        detections: list[dict[str, str]] = []

        for rule in DETECTION_PATTERNS:
            matches = rule["pattern"].findall(text)
            threshold = rule.get("threshold", 1)

            if len(matches) >= threshold:
                # Redact the match for logging (show first/last 2 chars)
                sample = matches[0] if matches else ""
                if len(sample) > 6:
                    redacted = sample[:2] + "*" * (len(sample) - 4) + sample[-2:]
                else:
                    redacted = "***"

                detections.append({
                    "type": rule["type"],
                    "subtype": rule["subtype"],
                    "severity": rule["severity"],
                    "detail": rule["detail"]
                    + (f" ({len(matches)} found)" if len(matches) > 1 else ""),
                    "match": redacted,
                })

        return detections

    # ---- risk scoring -----------------------------------------------------

    @staticmethod
    def _calculate_risk(detections: list[dict[str, str]]) -> str:
        """
        Determine overall risk level from a list of detections.

        Levels: low < medium < high < critical
        """
        if not detections:
            return "low"

        severities = {d["severity"] for d in detections}
        subtypes = {d["subtype"] for d in detections}

        # Critical combos
        if "ssn" in subtypes and "credit_card" in subtypes:
            return "critical"
        if "api_key" in subtypes:
            return "critical"
        if "connection_string" in subtypes:
            return "critical"

        # Inherit highest individual severity
        if "critical" in severities:
            return "critical"
        if "high" in severities:
            return "high"
        if "medium" in severities:
            return "medium"

        return "low"

    def _resolve_action(self, risk: str) -> str:
        """Map a risk level to an action using config."""
        return self.risk_actions.get(risk, "pass")

    # ---- cost estimation --------------------------------------------------

    def _estimate_cost(self, flow: http.HTTPFlow) -> float | None:
        """Rough cost estimate based on response size and domain."""
        if flow.response is None:
            return None

        content_length = flow.response.headers.get("content-length")
        if content_length is None:
            body = flow.response.get_text()
            if body:
                content_length = str(len(body.encode("utf-8")))
            else:
                return None

        try:
            byte_count = int(content_length)
        except (ValueError, TypeError):
            return None

        # Rough estimate: ~4 chars per token
        estimated_tokens = byte_count / 4.0
        host = flow.request.host
        cost_per_1k = self.cost_map.get(host, self.cost_map.get("default", 0.01))

        return (estimated_tokens / 1000.0) * cost_per_1k

    # ---- logging ----------------------------------------------------------

    def _log(
        self,
        event: str,
        *,
        host: str,
        endpoint: str,
        user: str,
        risk: str,
        detail: str,
        action: str,
        detections: list[dict] | None = None,
    ) -> None:
        """Write structured log entry to file and mitmproxy log."""
        detection_count = len(detections) if detections else 0
        msg = (
            f"{event} | host={host} | endpoint={endpoint} | user={user} "
            f"| risk={risk} | detections={detection_count} | action={action} "
            f"| detail={detail}"
        )

        if self.logger:
            if risk in ("critical", "high"):
                self.logger.warning(msg)
            elif risk == "medium":
                self.logger.info(msg)
            else:
                self.logger.debug(msg)

    # ---- backend reporting ------------------------------------------------

    def _report_event_async(
        self,
        *,
        timestamp: str,
        user: str,
        host: str,
        endpoint: str,
        risk: str,
        action: str,
        detections: list[dict],
        is_shadow_ai: bool,
    ) -> None:
        """POST event to Sentinel backend in a background thread."""
        api_base = self.config.get("sentinel_api", "http://localhost:8000")
        url = f"{api_base}/api/terminal-events"

        payload = {
            "timestamp": timestamp,
            "source": "proxy",
            "user": user,
            "host": host,
            "endpoint": endpoint,
            "risk_level": risk,
            "action": action,
            "detections": detections,
            "shadow_ai": is_shadow_ai,
            "session_stats": dict(self.stats),
        }

        def _post() -> None:
            try:
                import urllib.request

                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=5):
                    pass
            except Exception:
                # Silently fail — backend may not be running
                pass

        thread = threading.Thread(target=_post, daemon=True)
        thread.start()


# ---------------------------------------------------------------------------
# Module-level export for mitmproxy discovery
# ---------------------------------------------------------------------------

addons = [SentinelProxy()]
