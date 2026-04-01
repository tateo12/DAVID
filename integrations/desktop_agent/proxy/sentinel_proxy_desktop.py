"""
Sentinel Desktop Proxy Addon
============================
Subclasses SentinelProxy to add:
  - Process attribution (maps TCP port → PID → friendly app name)
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
# Desktop proxy addon
# ---------------------------------------------------------------------------


class SentinelDesktopProxy(SentinelProxy):
    """
    Desktop variant of SentinelProxy.

    Differences from parent:
    - Loads config_desktop.yaml (expanded domain list, process_display_names)
    - Adds process attribution to each capture (source_app, source_pid)
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
        """Attribute process then delegate to parent pipeline."""
        source_app, pid = self._attribute_process(flow)
        _tl.source_app = source_app
        _tl.source_pid = pid
        # Store raw body as fallback prompt; extract_prompt override will refine it
        _tl.prompt_text = flow.request.get_text() or ""
        super().request(flow)

    # ---- prompt extraction hook (captures parsed prompt into thread-local) ---

    def extract_prompt(self, host: str, body: dict) -> str:
        result = super().extract_prompt(host, body)
        _tl.prompt_text = result
        return result

    # ---- backend reporting --------------------------------------------------

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
        token = os.environ.get("SENTINEL_TOKEN", "")
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
                # Emit structured JSON for proxy-manager.ts to parse
                print(
                    json.dumps({
                        "event": "capture",
                        "risk": risk,
                        "host": host,
                        "source_app": source_app,
                        "shadow_ai": is_shadow_ai,
                    }),
                    flush=True,
                )
            except Exception as exc:
                print(
                    json.dumps({"event": "error", "detail": str(exc)}),
                    flush=True,
                )

        thread = threading.Thread(target=_post, daemon=True)
        thread.start()

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
