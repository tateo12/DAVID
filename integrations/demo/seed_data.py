#!/usr/bin/env python3
"""Seed Sentinel backend by replaying sample prompts via API."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

from api_client import SentinelApiClient

SCRIPT_DIR = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay sample prompts into Sentinel backend")
    parser.add_argument("--url", default="http://localhost:8000", help="Sentinel backend URL")
    parser.add_argument("--username", default="employee1", help="Auth username")
    parser.add_argument("--password", default="demo123", help="Auth password")
    parser.add_argument("--limit", type=int, default=120, help="Number of prompts to replay")
    args = parser.parse_args()

    prompts_file = SCRIPT_DIR / "sample_prompts.json"
    with open(prompts_file, encoding="utf-8") as f:
        sample_prompts = json.load(f)["prompts"]

    prompts = sample_prompts[: max(1, min(args.limit, len(sample_prompts)))]
    client = SentinelApiClient(args.url)
    login = client.login(args.username, args.password)
    print(f"Authenticated: {login['user']['username']} ({login['user']['role']})")

    ok, failed = 0, 0
    for prompt in prompts:
        payload = {
            "employee_id": prompt.get("employee_id", 1),
            "prompt_text": prompt.get("text", ""),
            "target_tool": str(prompt.get("target_tool", "chat.openai.com")).lower(),
            "metadata": {
                "source": "seed_data_script",
                "category": prompt.get("category", "unknown"),
                "department": prompt.get("department", "unknown"),
                "seeded_at": datetime.utcnow().isoformat(),
            },
        }
        try:
            client.post("/api/ops/events/employee-prompt", payload, auth=False)
            ok += 1
        except Exception:
            failed += 1

    req = Request(f"{args.url.rstrip('/')}/api/ops/tick?force=true", data=b"", method="POST")
    with urlopen(req) as response:
        tick = json.loads(response.read().decode("utf-8"))

    ran_jobs = [j.get("job_name") for j in tick.get("jobs", []) if j.get("status") == "ran"]
    print(f"Replay complete. ok={ok}, failed={failed}")
    print(f"Scheduler tick ran jobs: {', '.join(ran_jobs) if ran_jobs else 'none'}")


if __name__ == "__main__":
    main()
