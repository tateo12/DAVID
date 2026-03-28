from database import fetch_rows, init_db
from json_utils import loads_json
from models import Detection, DetectionLayer, DetectionType, RiskLevel


def _load_policy_for_role(role: str) -> dict:
    init_db()
    rows = fetch_rows(
        "SELECT role, rule_json FROM policies WHERE role = ? OR role = 'all' ORDER BY role DESC",
        (role,),
    )
    merged: dict = {}
    for row in rows:
        merged.update(loads_json(row["rule_json"], {}))
    return merged


def policy_enforcement(employee_role: str, prompt_text: str, detections: list[Detection]) -> list[Detection]:
    policy = _load_policy_for_role(employee_role)
    added: list[Detection] = []
    allow_code_roles = set(policy.get("allow_code_paste_roles", []))
    if "```" in prompt_text and employee_role not in allow_code_roles:
        added.append(
            Detection(
                type=DetectionType.policy,
                subtype="role_code_restriction",
                severity=RiskLevel.high,
                detail=f"Role '{employee_role}' cannot paste code to external tools.",
                span=(0, 3),
                confidence=0.9,
                layer=DetectionLayer.l1,
            )
        )
    return detections + added
