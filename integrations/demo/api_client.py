from __future__ import annotations

import json
import urllib.request
from typing import Any


class SentinelApiClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None

    def login(self, username: str, password: str) -> dict[str, Any]:
        body = self.post("/api/auth/login", {"username": username, "password": password}, auth=False)
        self.token = body["access_token"]
        return body

    def post(self, path: str, payload: dict[str, Any], auth: bool = True) -> dict[str, Any]:
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": f"Bearer {self.token}"} if auth and self.token else {}),
            },
            method="POST",
        )
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))

    def get(self, path: str, auth: bool = False) -> dict[str, Any]:
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            headers={**({"Authorization": f"Bearer {self.token}"} if auth and self.token else {})},
            method="GET",
        )
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
