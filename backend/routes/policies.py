import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from database import execute, fetch_one, fetch_rows
from models import PolicyRecord, UpdatePolicyRequest

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=list[PolicyRecord])
def list_policies() -> list[PolicyRecord]:
    rows = fetch_rows("SELECT id, name, role, rule_json, updated_at FROM policies ORDER BY id")
    return [
        PolicyRecord(
            id=row["id"],
            name=row["name"],
            role=row["role"],
            rule_json=json.loads(row["rule_json"]),
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


@router.put("/{policy_id}", response_model=PolicyRecord)
def update_policy(policy_id: int, payload: UpdatePolicyRequest) -> PolicyRecord:
    existing = fetch_one("SELECT id, name, role FROM policies WHERE id = ?", (policy_id,))
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
