from database import fetch_one
from detectors.policy_detector import detect_policy_violations
from engines.agents.contracts import PolicyEnforcementResult
from engines.policy_engine import policy_enforcement
from models import AnalyzeRequest, Detection


def _role_for_employee(employee_id: int) -> str:
    row = fetch_one("SELECT role FROM employees WHERE id = ?", (employee_id,))
    return row["role"] if row else "employee"


class PolicyEnforcementAgent:
    name = "PolicyEnforcementAgent"

    def run(self, payload: AnalyzeRequest, detections: list[Detection]) -> PolicyEnforcementResult:
        employee_role = _role_for_employee(payload.employee_id)
        policy_hits = detect_policy_violations(payload.prompt_text)
        combined = detections + policy_hits
        enforced = policy_enforcement(employee_role, payload.prompt_text, combined)
        return PolicyEnforcementResult(detections=enforced, employee_role=employee_role)
