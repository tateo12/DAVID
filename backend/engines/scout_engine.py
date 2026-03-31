"""Scout AI: telemetry from stored prompts + optional LLM replies."""

from __future__ import annotations

import os
from typing import Any

import requests

from config import get_settings, openrouter_chat_completions_url
from database import fetch_one, fetch_rows


def gather_prompt_telemetry() -> dict[str, Any]:
    total_row = fetch_one("SELECT COUNT(1) AS c FROM prompts")
    total = int(total_row["c"] or 0) if total_row else 0
    by_risk = fetch_rows(
        "SELECT risk_level, COUNT(1) AS c FROM prompts GROUP BY risk_level ORDER BY c DESC"
    )
    by_action = fetch_rows(
        "SELECT action, COUNT(1) AS c FROM prompts GROUP BY action ORDER BY c DESC LIMIT 12"
    )
    top_employees = fetch_rows(
        """
        SELECT p.employee_id, COALESCE(e.name, 'Unknown') AS name, e.department, COUNT(1) AS c
        FROM prompts p
        LEFT JOIN employees e ON e.id = p.employee_id
        GROUP BY p.employee_id, e.name, e.department
        ORDER BY c DESC
        LIMIT 10
        """
    )
    recent = fetch_rows(
        """
        SELECT p.id, p.employee_id, COALESCE(e.name, 'User') AS employee_name, p.risk_level,
               p.action, p.target_tool,
               substr(COALESCE(NULLIF(TRIM(p.prompt_text), ''), '(no text)'), 1, 160) AS snippet,
               p.created_at
        FROM prompts p
        LEFT JOIN employees e ON e.id = p.employee_id
        ORDER BY p.id DESC
        LIMIT 30
        """
    )
    high_recent = [
        r for r in recent if (str(r["risk_level"] or "").lower()) in ("high", "critical")
    ][:8]
    return {
        "total_prompts": total,
        "by_risk": [{"risk_level": r["risk_level"], "count": int(r["c"] or 0)} for r in by_risk],
        "by_action": [{"action": r["action"], "count": int(r["c"] or 0)} for r in by_action],
        "top_employees": [
            {
                "employee_id": int(r["employee_id"]),
                "name": r["name"],
                "department": r["department"] or "",
                "count": int(r["c"] or 0),
            }
            for r in top_employees
        ],
        "recent": [dict(r) for r in recent],
        "high_risk_recent": [dict(r) for r in high_recent],
    }


def format_telemetry_digest(data: dict[str, Any]) -> str:
    lines = [
        f"Total prompts logged: {data['total_prompts']}",
        "Risk distribution:",
    ]
    for r in data["by_risk"]:
        lines.append(f"  - {r['risk_level']}: {r['count']}")
    lines.append("Top actions:")
    for a in data["by_action"][:8]:
        lines.append(f"  - {a['action']}: {a['count']}")
    lines.append("Most active employees (by prompt count):")
    for e in data["top_employees"][:8]:
        dept = f", {e['department']}" if e.get("department") else ""
        lines.append(f"  - {e['name']} (id {e['employee_id']}{dept}): {e['count']} prompts")
    lines.append("Recent prompts (newest first, snippet only):")
    for p in data["recent"][:15]:
        sn = (p.get("snippet") or "").replace("\n", " ")
        tool = p.get("target_tool") or "—"
        lines.append(
            f"  - id {p['id']} | {p.get('employee_name')} | {p.get('risk_level')} | "
            f"action={p.get('action')} | tool={tool} | {sn}"
        )
    return "\n".join(lines)


def _openrouter_key() -> str:
    s = get_settings()
    return s.openrouter_api_key or os.getenv("API_SECRET_KEY", "")


def heuristic_scout_reply(user_message: str, data: dict[str, Any]) -> str:
    u = user_message.lower().strip()
    if not u:
        return (
            "Ask about **total prompts**, **risk mix**, **top employees**, **recent activity**, "
            "or **high-risk** items. I only use data already stored in Sentinel."
        )
    if any(k in u for k in ("help", "what can you", "capabilities")):
        return (
            "I answer from Sentinel's **prompts** table: counts, risk levels, actions, "
            "who submitted the most, and recent snippets. "
            "Example questions: “How many prompts?”, “Who has the most activity?”, "
            "“Summarize high risk”, “What actions are most common?”"
        )

    total = data["total_prompts"]
    if any(k in u for k in ("how many", "total", "count", "volume")) and "prompt" in u:
        return f"There are **{total}** prompts stored in Sentinel."
    if "how many" in u and "prompt" not in u and total >= 0:
        return f"There are **{total}** prompts logged. Say “prompts” for this count, or ask about risk or employees."

    if any(k in u for k in ("risk", "critical", "high risk", "distribution", "breakdown")):
        parts = [f"**{r['risk_level']}**: {r['count']}" for r in data["by_risk"]]
        if not parts:
            return "No risk breakdown yet — no prompts in the database."
        return "Risk distribution:\n" + "\n".join(parts)

    if any(k in u for k in ("who", "employee", "busiest", "most active", "top user")):
        if not data["top_employees"]:
            return "No per-employee stats yet."
        top = data["top_employees"][0]
        lines = [
            f"Most active: **{top['name']}** (employee id {top['employee_id']}) with **{top['count']}** prompts."
        ]
        if len(data["top_employees"]) > 1:
            lines.append("Runners-up: " + ", ".join(
                f"{e['name']} ({e['count']})" for e in data["top_employees"][1:5]
            ))
        return "\n".join(lines)

    if any(k in u for k in ("recent", "latest", "last", "newest")):
        if not data["recent"]:
            return "No recent prompts stored."
        bits = []
        for p in data["recent"][:5]:
            bits.append(
                f"- **{p.get('employee_name')}** [{p.get('risk_level')}] {p.get('snippet', '')[:100]}…"
            )
        return "Latest activity:\n" + "\n".join(bits)

    if any(k in u for k in ("high risk", "danger", "critical", "severe")) or (
        "high" in u and "risk" in u
    ):
        hr = data.get("high_risk_recent") or []
        if not hr:
            return "No high/critical risk prompts in the latest sample. Ask for **recent** prompts for a broader list."
        out = []
        for p in hr[:6]:
            out.append(
                f"- id {p['id']} **{p.get('risk_level')}** — {p.get('employee_name')}: "
                f"{(p.get('snippet') or '')[:120]}…"
            )
        return "Recent elevated-risk prompts:\n" + "\n".join(out)

    if any(k in u for k in ("action", "blocked", "allow", "quarantine")):
        if not data["by_action"]:
            return "No action breakdown available."
        lines = [f"**{a['action']}**: {a['count']}" for a in data["by_action"][:8]]
        return "Actions taken on prompts:\n" + "\n".join(lines)

    if "shadow" in u:
        return (
            "Shadow AI events live in a separate stream. Open **Shadow AI** in the nav for tool domains; "
            f"I only see **{total}** analyzed prompts here."
        )

    # fuzzy: match employee name
    for e in data["top_employees"]:
        name = (e.get("name") or "").lower()
        if len(name) > 2 and name in u:
            return (
                f"**{e['name']}** has **{e['count']}** logged prompts in Sentinel (employee id {e['employee_id']})."
            )

    return (
        "I don’t have a direct match. Try: total prompts, risk breakdown, top employees, "
        "recent snippets, high-risk prompts, or common actions. "
        f"(Currently **{total}** prompts on file.)"
    )


def scout_chat_with_llm(user_messages: list[dict[str, str]], digest: str) -> str | None:
    key = _openrouter_key()
    if not key:
        return None
    settings = get_settings()
    model = settings.skill_model_name or settings.l2_model_name
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_app_name,
    }
    system = (
        "You are Scout AI inside the Sentinel security console. "
        "First, use the provided TELEMETRY to answer questions about Sentinel's data (prompts, risks, users). "
        "However, if the user asks a general question, coding question, or requires general AI assistance, "
        "you must act as a helpful and knowledgeable AI assistant to answer their query instead of rejecting it. "
        "Always maintain your identity as a security-oriented AI. Be concise (under 200 words).\n\n"
        f"TELEMETRY:\n{digest}"
    )
    msgs: list[dict[str, str]] = [{"role": "system", "content": system}]
    for m in user_messages[-14:]:
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        content = (m.get("content") or "").strip()
        if not content:
            continue
        msgs.append({"role": role, "content": content[:8000]})
    payload = {
        "model": model,
        "temperature": 0.3,
        "max_tokens": 600,
        "messages": msgs,
    }
    try:
        resp = requests.post(
            openrouter_chat_completions_url(),
            headers=headers,
            json=payload,
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data["choices"][0]["message"]["content"]).strip()
    except Exception:
        return None


def run_scout_chat(messages: list[dict[str, str]]) -> tuple[str, bool]:
    """Returns (assistant_text, used_llm)."""
    data = gather_prompt_telemetry()
    digest = format_telemetry_digest(data)
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user" and (m.get("content") or "").strip():
            last_user = m["content"].strip()
            break
    llm_reply = scout_chat_with_llm(messages, digest)
    if llm_reply:
        return llm_reply, True
    return heuristic_scout_reply(last_user, data), False
