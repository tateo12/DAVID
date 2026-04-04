import json
from datetime import datetime, timezone

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from auth import get_current_user, get_org_id, resolve_org_id
from database import execute, fetch_one, fetch_rows
from json_utils import loads_json
from engines.policy_assistant_engine import list_policy_presets, run_policy_assistant
from models import (
    CreatePolicyRequest,
    PolicyAssistantChatRequest,
    PolicyAssistantChatResponse,
    PolicyPresetInfo,
    PolicyRecord,
    UpdatePolicyRequest,
)

router = APIRouter(prefix="/policies", tags=["policies"])

MANAGER_ROLES = frozenset({"manager", "admin"})


def require_policy_editor(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in MANAGER_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only employer (manager) accounts can create or edit AI policies.",
        )
    return current_user


@router.get("/assistant/presets", response_model=list[PolicyPresetInfo])
def policy_assistant_presets() -> list[PolicyPresetInfo]:
    return [PolicyPresetInfo(**row) for row in list_policy_presets()]


@router.post("/assistant/chat", response_model=PolicyAssistantChatResponse)
def policy_assistant_chat(
    payload: PolicyAssistantChatRequest,
    _: dict = Depends(require_policy_editor),
) -> PolicyAssistantChatResponse:
    raw = [{"role": m.role, "content": m.content} for m in payload.messages]
    msg, rule, used = run_policy_assistant(raw, payload.selected_presets, payload.draft_rule)
    return PolicyAssistantChatResponse(message=msg, rule_json=rule, used_llm=used)


@router.get("", response_model=list[PolicyRecord])
def list_policies(
    current_user: dict = Depends(get_current_user),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> list[PolicyRecord]:
    org_id = resolve_org_id(current_user, x_org_id)
    rows = fetch_rows("SELECT id, name, role, rule_json, updated_at FROM policies WHERE org_id = ? ORDER BY id", (org_id,))
    return [
        PolicyRecord(
            id=row["id"],
            name=row["name"],
            role=row["role"],
            rule_json=loads_json(row["rule_json"], {}),
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


@router.post("", response_model=PolicyRecord)
def create_policy(payload: CreatePolicyRequest, current_user: dict = Depends(require_policy_editor)) -> PolicyRecord:
    org_id = get_org_id(current_user)
    updated_at = datetime.now(timezone.utc).isoformat()
    new_id = execute(
        "INSERT INTO policies (name, role, rule_json, updated_at, org_id) VALUES (?, ?, ?, ?, ?)",
        (payload.name.strip(), payload.role.strip(), json.dumps(payload.rule_json), updated_at, org_id),
    )
    if not new_id:
        raise HTTPException(status_code=500, detail="Failed to create policy")
    row = fetch_one(
        "SELECT id, name, role, rule_json, updated_at FROM policies WHERE id = ?",
        (new_id,),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Policy not found after insert")
    return PolicyRecord(
        id=row["id"],
        name=row["name"],
        role=row["role"],
        rule_json=loads_json(row["rule_json"], {}),
        updated_at=row["updated_at"],
    )


@router.put("/{policy_id}", response_model=PolicyRecord)
def update_policy(
    policy_id: int,
    payload: UpdatePolicyRequest,
    current_user: dict = Depends(require_policy_editor),
) -> PolicyRecord:
    org_id = get_org_id(current_user)
    existing = fetch_one("SELECT id, name, role FROM policies WHERE id = ? AND org_id = ?", (policy_id, org_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")
    updated_at = datetime.now(timezone.utc).isoformat()
    execute(
        "UPDATE policies SET rule_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(payload.rule_json), updated_at, policy_id),
    )
    return PolicyRecord(
        id=existing["id"],
        name=existing["name"],
        role=existing["role"],
        rule_json=payload.rule_json,
        updated_at=updated_at,
    )
