#!/usr/bin/env python3
"""Quick demo readiness check for Sentinel end-to-end flow."""

from __future__ import annotations

import argparse
import json
from urllib.error import URLError
from urllib.request import Request, urlopen


def request_json(url: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=10) as response:
        body = response.read().decode("utf-8")
        return response.status, json.loads(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate backend + integrations demo endpoints")
    parser.add_argument("--url", default="http://localhost:8000", help="Sentinel backend URL")
    parser.add_argument("--analyze", action="store_true", help="Run a sample analyze call")
    args = parser.parse_args()

    base = args.url.rstrip("/")
    checks = [
        ("/health", "GET", None),
        ("/api/metrics", "GET", None),
        ("/api/employees", "GET", None),
        ("/api/prompts?limit=5", "GET", None),
        ("/api/reports/weekly", "GET", None),
        ("/api/shadow-ai", "GET", None),
        ("/api/agents", "GET", None),
    ]
    if args.analyze:
        checks.append(
            (
                "/api/analyze",
                "POST",
                {
                    "employee_id": 1,
                    "prompt_text": "Summarize this customer issue with SSN 123-45-6789",
                    "target_tool": "sentinel-demo-check",
                },
            )
        )

    failed = 0
    for path, method, payload in checks:
        url = f"{base}{path}"
        try:
            status, body = request_json(url, method=method, payload=payload)
            print(f"[OK] {method:4} {path} -> {status}")
            if path == "/api/analyze":
                print(f"     risk={body.get('risk_level')} action={body.get('action')}")
        except URLError as exc:
            failed += 1
            print(f"[FAIL] {method:4} {path} -> {exc}")
        except Exception as exc:  # noqa: BLE001 - best-effort demo script
            failed += 1
            print(f"[FAIL] {method:4} {path} -> {exc}")

    if failed:
        raise SystemExit(1)

    print("\nDemo readiness check passed.")


if __name__ == "__main__":
    main()
