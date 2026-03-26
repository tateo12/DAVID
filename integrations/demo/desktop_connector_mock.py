"""
Desktop connector mock for Copilot-like usage.

This script simulates a native desktop AI app sending prompt + output turns
into Sentinel through the same extension ingestion APIs.
"""

from __future__ import annotations

import json
import urllib.request


BASE_URL = "http://localhost:8000"
USERNAME = "employee1"
PASSWORD = "demo123"


def post_json(path: str, payload: dict, token: str | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def login() -> str:
    body = post_json(
        "/api/auth/login",
        {"username": USERNAME, "password": PASSWORD},
    )
    return body["access_token"]


def send_desktop_turn(token: str) -> dict:
    payload = {
        "prompt_text": "Copilot: summarize this ticket with customer email jane@customer.com",
        "ai_output_text": "Summary: Customer Jane requested refund. Contact jane@customer.com for follow up.",
        "target_tool": "copilot.desktop.local",
        "conversation_id": "desktop-session-1",
        "turn_id": "turn-001",
        "metadata": {
            "source": "desktop_connector_mock",
            "desktop_app": "copilot",
            "window_title": "Copilot - Sales Assist",
        },
    }
    return post_json("/api/extension/capture-turn", payload, token=token)


if __name__ == "__main__":
    access_token = login()
    result = send_desktop_turn(access_token)
    print("Desktop connector mock sent.")
    print(json.dumps(result, indent=2))
