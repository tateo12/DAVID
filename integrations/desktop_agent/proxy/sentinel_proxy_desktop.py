"""
Sentinel Desktop Proxy Addon
============================
Subclasses SentinelProxy to add:
  - Process attribution (maps TCP port → PID → friendly app name)
  - Synchronous backend check for blocking (L2/L3 analysis)
  - Posts to /api/extension/capture instead of /api/terminal-events
  - Uses config_desktop.yaml with expanded domain list

Usage:
    mitmdump -s sentinel_proxy_desktop.py --listen-port 9876
"""

from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Ensure parent proxy module is importable
# ---------------------------------------------------------------------------

_PARENT_PROXY_DIR = Path(__file__).resolve().parent.parent.parent / "terminal" / "proxy"
if str(_PARENT_PROXY_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_PROXY_DIR))

from sentinel_proxy import SentinelProxy, DEFAULT_CONFIG  # noqa: E402

import yaml
from mitmproxy import ctx, http

# ---------------------------------------------------------------------------
# Module-level thread-local for passing per-request context into override hooks
# ---------------------------------------------------------------------------

_tl: threading.local = threading.local()

# ---------------------------------------------------------------------------
# Desktop config path
# ---------------------------------------------------------------------------

_DESKTOP_CONFIG_PATH = Path(__file__).resolve().parent / "config_desktop.yaml"


def _load_desktop_config() -> dict:
    if _DESKTOP_CONFIG_PATH.exists():
        with open(_DESKTOP_CONFIG_PATH, "r") as fh:
            user_cfg = yaml.safe_load(fh) or {}
        merged = {**DEFAULT_CONFIG, **user_cfg}
        for key in ("risk_actions", "cost_per_1k_tokens"):
            if key in user_cfg and isinstance(user_cfg[key], dict):
                merged[key] = {**DEFAULT_CONFIG.get(key, {}), **user_cfg[key]}
        return merged
    return dict(DEFAULT_CONFIG)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

_cached_token: str = ""


def _get_auth_token() -> str:
    """Read auth token from temp file (consumed on first read) or env var."""
    global _cached_token
    if _cached_token:
        return _cached_token

    token_file = os.environ.get("SENTINEL_TOKEN_FILE", "")
    if token_file:
        try:
            with open(token_file, "r") as _tf:
                _cached_token = _tf.read().strip()
            os.unlink(token_file)  # consume immediately
        except OSError:
            pass

    if not _cached_token:
        _cached_token = os.environ.get("SENTINEL_TOKEN", "")

    return _cached_token


# ---------------------------------------------------------------------------
# Desktop proxy addon
# ---------------------------------------------------------------------------


class SentinelDesktopProxy(SentinelProxy):
    """
    Desktop variant of SentinelProxy.

    Differences from parent:
    - Loads config_desktop.yaml (expanded domain list, process_display_names)
    - Adds process attribution to each capture (source_app, source_pid)
    - Checks backend for blocking decisions before allowing requests
    - Reports to POST /api/extension/capture with desktop metadata
    - Auth token read from SENTINEL_TOKEN env var
    """

    def __init__(self) -> None:
        super().__init__()
        self._process_display_names: dict[str, Any] = {}

    # ---- lifecycle ----------------------------------------------------------

    def load(self, loader) -> None:  # noqa: ANN001
        loader.add_option(
            name="sentinel_mode",
            typespec=str,
            default="warn",
            help="Sentinel enforcement mode: log-only | warn | block",
        )
        loader.add_option(
            name="sentinel_api",
            typespec=str,
            default=os.environ.get("SENTINEL_API_URL", "http://localhost:8000"),
            help="URL of the Sentinel backend API",
        )

        self.config = _load_desktop_config()
        self._process_display_names = self.config.get("process_display_names", {})
        self._apply_config()

        ctx.log.info("[Sentinel Desktop] Proxy loaded with desktop config")

    # ---- request hook -------------------------------------------------------

    def request(self, flow: http.HTTPFlow) -> None:
        """Attribute process, check backend for blocking, then delegate to parent."""
        host = flow.request.host

        # Only process monitored domains
        if host not in self.monitored_domains:
            return

        source_app, pid = self._attribute_process(flow)
        _tl.source_app = source_app
        _tl.source_pid = pid

        # Extract prompt text
        body_text = flow.request.get_text() or ""
        _tl.prompt_text = body_text

        try:
            body = json.loads(body_text) if body_text else None
        except (json.JSONDecodeError, ValueError):
            body = None

        if body is not None:
            prompt = self.extract_prompt(host, body)
        else:
            prompt = body_text

        _tl.prompt_text = prompt

        # Run local L1 scan first (parent class)
        local_detections = self.scan(prompt)
        local_risk = self._calculate_risk(local_detections)

        # If local scan finds critical risk, block immediately (no backend call needed)
        if local_risk == "critical":
            self._block_flow(flow, local_risk, local_detections, host, source_app)
            self._report_event_async(
                timestamp=self._utcnow(),
                user="",
                host=host,
                endpoint=flow.request.pretty_url,
                risk=local_risk,
                action="block",
                detections=[{"type": d["type"], "subtype": d["subtype"], "detail": d["detail"]} for d in local_detections],
                is_shadow_ai=host not in self.approved_tools,
            )
            return

        # For non-critical: check backend for L2/L3 analysis with blocking
        backend_action = self._check_backend(prompt, host, source_app, pid)

        if backend_action == "block":
            self._block_flow(flow, "high", local_detections, host, source_app)
            return

        # Allow the request, report asynchronously
        risk = local_risk if local_risk != "low" else (backend_action if backend_action in ("medium", "high") else "low")
        self._report_event_async(
            timestamp=self._utcnow(),
            user="",
            host=host,
            endpoint=flow.request.pretty_url,
            risk=risk,
            action="allow",
            detections=[{"type": d["type"], "subtype": d["subtype"], "detail": d["detail"]} for d in local_detections],
            is_shadow_ai=host not in self.approved_tools,
        )

    # ---- prompt extraction hook ---------------------------------------------

    def extract_prompt(self, host: str, body: dict) -> str:
        result = super().extract_prompt(host, body)
        _tl.prompt_text = result
        return result

    # ---- backend blocking check ---------------------------------------------

    def _check_backend(self, prompt: str, host: str, source_app: str, pid: int | None) -> str:
        """
        Synchronous call to backend /api/extension/capture with preview_only=true.
        Returns the action from the backend: 'allow', 'block', 'warn', etc.
        Falls back to 'allow' on timeout or error (fail-open for usability).
        """
        if not prompt.strip():
            return "allow"

        api_base = self.config.get("sentinel_api", "http://localhost:8000")
        token = _get_auth_token()
        employee_id_raw = os.environ.get("SENTINEL_EMPLOYEE_ID", "")
        employee_id = int(employee_id_raw) if employee_id_raw.isdigit() else None

        url = f"{api_base}/api/extension/capture"
        payload = {
            "prompt_text": prompt,
            "target_tool": host,
            "attachments": [],
            "warning_confirmed": False,
            "warning_context_id": None,
            "preview_only": False,
            "metadata": {
                "source": "desktop_proxy",
                "capture_method": "desktop_proxy",
                "source_app": source_app,
                "source_app_pid": pid,
            },
        }
        if employee_id is not None:
            payload["employee_id"] = employee_id

        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        try:
            import urllib.request as _urllib_req

            data = json.dumps(payload).encode("utf-8")
            req = _urllib_req.Request(url, data=data, headers=headers, method="POST")
            with _urllib_req.urlopen(req, timeout=3) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            action = result.get("action", "allow")
            risk = result.get("risk_level", "low")

            # Emit structured JSON for proxy-manager.ts to parse
            print(
                json.dumps({
                    "event": "capture",
                    "risk": risk,
                    "host": host,
                    "source_app": source_app,
                    "shadow_ai": host not in self.approved_tools,
                    "action": action,
                }),
                flush=True,
            )

            return action

        except Exception as exc:
            # Fail open — log error but allow request
            print(
                json.dumps({"event": "error", "detail": str(exc)}),
                flush=True,
            )
            return "allow"

    # ---- blocking -----------------------------------------------------------

    def _block_flow(
        self,
        flow: http.HTTPFlow,
        risk: str,
        detections: list[dict],
        host: str,
        source_app: str,
    ) -> None:
        """Set the flow response to a 403 block page."""
        detection_summaries = [
            {"type": d.get("type", ""), "subtype": d.get("subtype", ""), "detail": d.get("detail", "")}
            for d in detections
        ]
        block_body = json.dumps(
            {
                "error": "Request blocked by Sentinel AI Security",
                "reason": "Detected sensitive or forbidden content in prompt",
                "detections": detection_summaries,
                "risk_level": risk,
                "source_app": source_app,
                "policy": "Remove sensitive data and retry",
            },
            indent=2,
        )
        flow.response = http.Response.make(
            403,
            block_body.encode("utf-8"),
            {"Content-Type": "application/json", "X-Sentinel-Blocked": "true"},
        )

        print(
            json.dumps({
                "event": "capture",
                "risk": risk,
                "host": host,
                "source_app": source_app,
                "action": "block",
                "shadow_ai": host not in self.approved_tools,
            }),
            flush=True,
        )

        ctx.log.warn(f"[Sentinel Desktop] BLOCKED request to {host} from {source_app} (risk={risk})")

    # ---- backend reporting (async, for allowed requests) ---------------------

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
        """Override: POST to /api/extension/capture instead of /api/terminal-events."""
        api_base = self.config.get("sentinel_api", "http://localhost:8000")
        token = _get_auth_token()
        employee_id_raw = os.environ.get("SENTINEL_EMPLOYEE_ID", "")
        employee_id = int(employee_id_raw) if employee_id_raw.isdigit() else None

        source_app = getattr(_tl, "source_app", "unknown")
        source_pid = getattr(_tl, "source_pid", None)
        prompt_text = getattr(_tl, "prompt_text", "") or ""

        url = f"{api_base}/api/extension/capture"

        payload = {
            "prompt_text": prompt_text,
            "target_tool": host,
            "attachments": [],
            "warning_confirmed": False,
            "warning_context_id": None,
            "preview_only": False,
            "metadata": {
                "source": "desktop_proxy",
                "capture_method": "desktop_proxy",
                "source_app": source_app,
                "source_app_pid": source_pid,
                "host": host,
                "endpoint": endpoint,
                "proxy_user": user,
                "proxy_risk": risk,
                "proxy_action": action,
                "shadow_ai": is_shadow_ai,
                "captured_at": timestamp,
                "detections": detections,
            },
        }
        if employee_id is not None:
            payload["employee_id"] = employee_id

        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        def _post() -> None:
            try:
                import urllib.request as _urllib_req

                data = json.dumps(payload).encode("utf-8")
                req = _urllib_req.Request(url, data=data, headers=headers, method="POST")
                with _urllib_req.urlopen(req, timeout=8):
                    pass
            except Exception as exc:
                print(
                    json.dumps({"event": "error", "detail": str(exc)}),
                    flush=True,
                )

        thread = threading.Thread(target=_post, daemon=True)
        thread.start()

    # ---- helper: utcnow as ISO string ---------------------------------------

    @staticmethod
    def _utcnow() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    # ---- process attribution ------------------------------------------------

    def _attribute_process(self, flow: http.HTTPFlow) -> tuple[str, int | None]:
        """
        Map the client-side TCP port to a process name.

        flow.client_conn.peername is (ip, port) of the client connecting to
        the proxy.  We look that port up in the system's TCP connection table
        to find the owning PID and then the process name.
        """
        try:
            import psutil

            client_port = flow.client_conn.peername[1]
            for conn in psutil.net_connections(kind="tcp"):
                if conn.laddr.port == client_port and conn.pid:
                    try:
                        proc = psutil.Process(conn.pid)
                        name = self._friendly_name(proc)
                        return name, conn.pid
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
        except Exception:
            pass
        return "unknown", None

    def _friendly_name(self, proc) -> str:  # noqa: ANN001
        """
        Map a psutil Process to a human-readable application name using the
        process_display_names table in config_desktop.yaml.
        """
        try:
            import psutil

            exe_name = proc.name().lower()
            exe_path = ""
            try:
                exe_path = proc.exe().lower()
            except (psutil.AccessDenied, psutil.ZombieProcess):
                pass

            display_rules = self._process_display_names
            if exe_name in display_rules:
                rules = display_rules[exe_name]
                if isinstance(rules, list):
                    for rule in rules:
                        match_path = rule.get("match_path", "").lower()
                        if match_path and match_path in exe_path:
                            return rule.get("display", exe_name)
                    # Default rule (no match_path)
                    for rule in rules:
                        if not rule.get("match_path"):
                            return rule.get("display", exe_name)
                elif isinstance(rules, str):
                    return rules

            return proc.name()
        except Exception:
            return "unknown"


# ---------------------------------------------------------------------------
# Module-level export for mitmproxy discovery
# ---------------------------------------------------------------------------

addons = [SentinelDesktopProxy()]
