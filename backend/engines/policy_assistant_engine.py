"""Interactive policy drafting: preset merges + optional LLM refinement."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

from config import get_settings, openrouter_chat_completions_url

# Presets map to slices of rule_json understood by policy_engine / extension.
PRESET_LABELS: dict[str, tuple[str, str]] = {
    "block_unknown_ai": ("Block unapproved tools", "Adds example blocked hostnames for unknown AI endpoints."),
    "forbid_confidential_language": ("Confidential language", "Flags internal / NDA-style terms."),
    "forbid_credentials": ("Secrets & credentials", "Discourages passwords, API keys, and SSN-style content."),
    "engineers_may_paste_code": ("Engineers may paste code", "Only engineer role may include code blocks."),
    "strict_no_code_paste": ("No code pastes", "Empty allow list — no role may paste code blocks."),
    "extension_warn_medium": ("Extension warns at medium+", "Lower bar for in-browser warnings."),
    "extension_warn_high": ("Extension warns at high+", "Default stricter extension warnings."),
    "log_all_high": ("High visibility", "Description + high extension warning threshold."),
}

PRESET_DEFINITIONS: dict[str, dict[str, Any]] = {
    "block_unknown_ai": {
        "blocked_tools": ["unknown-ai.example", "unapproved-llm"],
        "description": "Block known unapproved AI endpoints.",
    },
    "forbid_confidential_language": {
        "forbidden_keywords": ["confidential", "internal-only", "restricted", "nda"],
    },
    "forbid_credentials": {
        "forbidden_keywords": ["password", "ssn", "social security", "api key", "secret key"],
    },
    "engineers_may_paste_code": {
        "allow_code_paste_roles": ["engineer"],
    },
    "strict_no_code_paste": {
        "allow_code_paste_roles": [],
    },
    "extension_warn_medium": {
        "extension_warning_threshold": "medium",
    },
    "extension_warn_high": {
        "extension_warning_threshold": "high",
    },
    "log_all_high": {
        "description": "Escalate visibility on risky prompts; pair with extension threshold.",
        "extension_warning_threshold": "high",
    },
}


def _openrouter_key() -> str:
    s = get_settings()
    return s.openrouter_api_key or os.getenv("API_SECRET_KEY", "")


def _empty_rule() -> dict[str, Any]:
    return {
        "description": "",
        "blocked_tools": [],
        "forbidden_keywords": [],
        "allow_code_paste_roles": ["engineer"],
        "extension_warning_threshold": "high",
    }


def merge_list_fields(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = json.loads(json.dumps(base))
    list_keys = ("blocked_tools", "forbidden_keywords", "allow_code_paste_roles")
    for k, v in patch.items():
        if k in list_keys and isinstance(v, list):
            cur = list(out.get(k) or [])
            if k == "allow_code_paste_roles":
                out[k] = list(v)
            else:
                out[k] = sorted({str(x).strip() for x in cur + v if str(x).strip()})
        else:
            out[k] = v
    return out


def apply_selected_presets(preset_ids: list[str]) -> dict[str, Any]:
    d = _empty_rule()
    for pid in preset_ids:
        patch = PRESET_DEFINITIONS.get(pid)
        if patch:
            d = merge_list_fields(d, patch)
    return d


def merge_draft_with_presets(preset_ids: list[str], draft: dict[str, Any]) -> dict[str, Any]:
    base = apply_selected_presets(preset_ids)
    return merge_list_fields(base, draft)


def _parse_json_block(content: str) -> dict[str, Any] | None:
    text = content.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return None


def run_policy_assistant(
    messages: list[dict[str, str]],
    preset_ids: list[str],
    draft_rule: dict[str, Any],
) -> tuple[str, dict[str, Any], bool]:
    """Returns (assistant_text, merged_rule_json, used_llm)."""
    merged = merge_draft_with_presets(preset_ids, draft_rule)
    if not messages:
        return ("Select building blocks, then **Apply to draft** or send a message.", merged, False)

    key = _openrouter_key()
    if not key:
        return (
            _heuristic_reply(messages[-1]["content"], merged, preset_ids),
            merged,
            False,
        )

    settings = get_settings()
    model = settings.skill_model_name or settings.l2_model_name
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_app_name,
    }
    preset_labels = ", ".join(preset_ids) or "(none)"
    system = (
        "You help Sentinel admins draft policy rule_json. Output a single JSON object ONLY, no markdown fences, "
        'with keys: "reply" (string, user-facing explanation, under 120 words) and '
        '"rule_json" (object). '
        "rule_json MUST include these keys: description (string), blocked_tools (array of strings), "
        "forbidden_keywords (array of strings), allow_code_paste_roles (array of strings), "
        "extension_warning_threshold (one of: low, medium, high, critical). "
        "Refine the draft based on the conversation; keep arrays deduplicated and sensible.\n\n"
        f"Selected presets (already merged into starting draft): {preset_labels}\n"
        f"Starting merged draft:\n{json.dumps(merged, indent=2)}"
    )
    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for m in messages[-12:]:
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        c = (m.get("content") or "").strip()
        if c:
            llm_messages.append({"role": role, "content": c[:12000]})

    payload = {"model": model, "temperature": 0.25, "max_tokens": 900, "messages": llm_messages}
    try:
        resp = requests.post(
            openrouter_chat_completions_url(),
            headers=headers,
            json=payload,
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()
        raw = str(data["choices"][0]["message"]["content"]).strip()
        parsed = _parse_json_block(raw)
        if not parsed:
            return (
                "I could not parse a policy update. Try rephrasing, or adjust JSON manually.",
                merged,
                True,
            )
        reply = str(parsed.get("reply", "Updated policy draft."))[:2000]
        rule = parsed.get("rule_json")
        if isinstance(rule, dict):
            normalized = merge_list_fields(_empty_rule(), rule)
            return reply, normalized, True
        return reply, merged, True
    except Exception:
        return _heuristic_reply(messages[-1]["content"], merged, preset_ids), merged, False


def list_policy_presets() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for pid in PRESET_DEFINITIONS:
        label, desc = PRESET_LABELS.get(pid, (pid.replace("_", " ").title(), ""))
        items.append({"id": pid, "label": label, "description": desc})
    return sorted(items, key=lambda x: x["label"])


def _heuristic_reply(last_user: str, merged: dict[str, Any], preset_ids: list[str]) -> str:
    u = last_user.lower().strip()
    if any(k in u for k in ("merge", "apply", "preset", "building block", "initialize")):
        return (
            f"Applied **{len(preset_ids)}** building blocks. The draft now has "
            f"{len(merged.get('forbidden_keywords') or [])} forbidden keywords and "
            f"{len(merged.get('blocked_tools') or [])} blocked tools. "
            "Add details in chat (with LLM enabled) or edit **Review JSON**."
        )
    if not u:
        return (
            "Pick **policy building blocks** above, then describe nuances here (e.g. extra keywords, "
            "which roles may paste code). With an API key configured, I can refine the full JSON automatically."
        )
    if "help" in u or "what" in u and "do" in u:
        return (
            f"Current draft has **{len(merged.get('forbidden_keywords') or [])}** forbidden keywords and "
            f"**{len(merged.get('blocked_tools') or [])}** blocked tools. "
            "Ask to add keywords, tighten code paste rules, or change the extension warning level."
        )
    if "keyword" in u or "forbid" in u or "block word" in u:
        return (
            "To add keywords without the LLM, switch to **Review JSON** and edit `forbidden_keywords`. "
            f"Presets applied: **{', '.join(preset_ids) or 'none'}**."
        )
    return (
        "I’m in **offline** mode (no LLM key or request failed). Your selections are merged into the draft JSON. "
        "Open **Review JSON** to edit lists directly, or configure OpenRouter/API key for chat-driven updates."
    )
