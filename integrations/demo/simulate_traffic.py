#!/usr/bin/env python3
"""Async traffic simulator for the Sentinel API.

Reads sample_prompts.json and sends prompts to the /api/analyze endpoint
either all at once (burst mode) or one at a time with random delays (drip mode).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
from datetime import datetime
from pathlib import Path

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Terminal colors (ANSI escape codes)
# ---------------------------------------------------------------------------

RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"
DIM = "\033[2m"

RISK_COLORS = {
    "low": GREEN,
    "medium": YELLOW,
    "high": RED,
    "critical": RED + BOLD,
}


def colorize(text: str, color: str) -> str:
    return f"{color}{text}{RESET}"


def risk_color(level: str) -> str:
    return RISK_COLORS.get(level, RESET)


# ---------------------------------------------------------------------------
# Prompt loading
# ---------------------------------------------------------------------------

def load_prompts() -> list[dict]:
    """Load sample prompts from the JSON file in the same directory."""
    prompts_file = SCRIPT_DIR / "sample_prompts.json"
    if not prompts_file.exists():
        print(f"ERROR: sample_prompts.json not found at {prompts_file}")
        sys.exit(1)

    with open(prompts_file) as f:
        data = json.load(f)
    return data["prompts"]


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

def format_prompt_line(
    prompt: dict,
    action: str | None = None,
    response_risk: str | None = None,
) -> str:
    """Format a single prompt result line for terminal display."""
    now = datetime.now().strftime("%H:%M:%S")
    emp_id = prompt.get("employee_id", "?")
    dept = prompt.get("department", "unknown")
    text = prompt.get("text", "")[:60]

    # Use response risk level if available, otherwise fall back to expected
    risk = response_risk or prompt.get("expected_risk", "low")
    color = risk_color(risk)
    action_str = action or "—"

    risk_label = risk.upper().ljust(8)
    action_label = action_str.ljust(8)
    truncated = f"{text}..." if len(prompt.get("text", "")) > 60 else text

    return (
        f"{DIM}{now}{RESET}  "
        f"emp={CYAN}{emp_id:<3}{RESET} "
        f"dept={dept:<12} "
        f"risk={colorize(risk_label, color)} "
        f"action={colorize(action_label, color)} "
        f"{DIM}{truncated}{RESET}"
    )


def print_header(mode: str, count: int, url: str, dry_run: bool) -> None:
    print()
    print(colorize("=" * 70, BOLD))
    print(colorize("  SENTINEL TRAFFIC SIMULATOR", BOLD))
    print(colorize("=" * 70, BOLD))
    print(f"  Target:   {url}")
    print(f"  Mode:     {mode}")
    print(f"  Prompts:  {count}")
    if dry_run:
        print(colorize("  DRY RUN — no HTTP calls will be made", YELLOW))
    print(colorize("=" * 70, BOLD))
    print()


# ---------------------------------------------------------------------------
# Sending logic
# ---------------------------------------------------------------------------

async def send_prompt(
    client: httpx.AsyncClient,
    url: str,
    prompt: dict,
    dry_run: bool = False,
) -> None:
    """Send a single prompt to the API and display the result."""
    endpoint = f"{url.rstrip('/')}/api/analyze"
    payload = {
        "employee_id": prompt.get("employee_id", 1),
        "prompt_text": prompt.get("text", ""),
        "target_tool": prompt.get("target_tool", "Claude"),
    }

    if dry_run:
        line = format_prompt_line(prompt, action="DRY-RUN")
        print(line)
        return

    try:
        resp = await client.post(endpoint, json=payload, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            action = data.get("action", "unknown")
            resp_risk = data.get("risk_level", None)
            line = format_prompt_line(prompt, action=action, response_risk=resp_risk)
            print(line)
        else:
            line = format_prompt_line(prompt, action=f"HTTP-{resp.status_code}")
            print(line)
    except httpx.ConnectError:
        print(colorize(
            f"  [WARN] Connection refused at {endpoint} — is the server running?",
            YELLOW,
        ))
    except httpx.TimeoutException:
        print(colorize(
            f"  [WARN] Request timed out for employee {prompt.get('employee_id')}",
            YELLOW,
        ))
    except httpx.HTTPError as exc:
        print(colorize(
            f"  [WARN] HTTP error: {exc}",
            YELLOW,
        ))


async def burst_mode(
    client: httpx.AsyncClient,
    url: str,
    prompts: list[dict],
    dry_run: bool,
) -> None:
    """Send all prompts concurrently."""
    print(colorize("Sending all prompts concurrently...\n", BOLD))
    tasks = [send_prompt(client, url, p, dry_run) for p in prompts]
    await asyncio.gather(*tasks)


async def drip_mode(
    client: httpx.AsyncClient,
    url: str,
    prompts: list[dict],
    min_delay: float,
    max_delay: float,
    dry_run: bool,
) -> None:
    """Send prompts one at a time with random delays."""
    print(colorize(
        f"Dripping prompts with {min_delay:.1f}s–{max_delay:.1f}s delay...\n",
        BOLD,
    ))
    shuffled = list(prompts)
    random.shuffle(shuffled)

    for i, prompt in enumerate(shuffled, 1):
        await send_prompt(client, url, prompt, dry_run)

        if i < len(shuffled):
            delay = random.uniform(min_delay, max_delay)
            await asyncio.sleep(delay)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def async_main() -> None:
    parser = argparse.ArgumentParser(description="Simulate AI prompt traffic against the Sentinel API")
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL of the Sentinel API (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--burst",
        action="store_true",
        help="Send all prompts concurrently instead of dripping",
    )
    parser.add_argument(
        "--min-delay",
        type=float,
        default=2.0,
        help="Minimum delay between prompts in drip mode (default: 2.0s)",
    )
    parser.add_argument(
        "--max-delay",
        type=float,
        default=5.0,
        help="Maximum delay between prompts in drip mode (default: 5.0s)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="Limit the number of prompts to send (0 = all, default: 0)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be sent without making HTTP calls",
    )
    args = parser.parse_args()

    # Load prompts
    all_prompts = load_prompts()

    # Apply count limit
    if args.count > 0:
        prompts = all_prompts[:args.count]
    else:
        prompts = all_prompts

    mode = "BURST" if args.burst else "DRIP"
    print_header(mode, len(prompts), args.url, args.dry_run)

    async with httpx.AsyncClient() as client:
        if args.burst:
            await burst_mode(client, args.url, prompts, args.dry_run)
        else:
            await drip_mode(
                client, args.url, prompts,
                min_delay=args.min_delay,
                max_delay=args.max_delay,
                dry_run=args.dry_run,
            )

    # Summary
    print()
    print(colorize("=" * 70, BOLD))
    total = len(prompts)
    safe = sum(1 for p in prompts if p.get("expected_risk") == "low")
    medium = sum(1 for p in prompts if p.get("expected_risk") == "medium")
    high = sum(1 for p in prompts if p.get("expected_risk") == "high")
    critical = sum(1 for p in prompts if p.get("expected_risk") == "critical")
    print(f"  Sent {total} prompts: "
          f"{colorize(f'{safe} safe', GREEN)}, "
          f"{colorize(f'{medium} medium', YELLOW)}, "
          f"{colorize(f'{high} high', RED)}, "
          f"{colorize(f'{critical} critical', RED + BOLD)}")
    print(colorize("=" * 70, BOLD))
    print()


if __name__ == "__main__":
    asyncio.run(async_main())
