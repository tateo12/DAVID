from time import perf_counter
from typing import Any, Callable, TypeVar

from database import (
    create_alert,
    create_prompt_record,
    execute,
    record_employee_interaction_memory,
    record_skill_evaluation,
)
from engines.action_engine import choose_action, choose_risk_level
from engines.agents.agent_supervision_budget_profitability_agent import AgentSupervisionBudgetProfitabilityAgent
from engines.agents.employee_supervision_coach_security_agent import EmployeeSupervisionCoachSecurityAgent
from engines.agents.policy_enforcement_agent import PolicyEnforcementAgent
from models import ActionType, AgentExecutionReport, AnalyzeRequest, AnalyzeResponse, Detection, DetectionLayer, RiskLevel

T = TypeVar("T")


class MainOrchestrator:
    def __init__(self) -> None:
        self._policy_agent = PolicyEnforcementAgent()
        self._employee_agent = EmployeeSupervisionCoachSecurityAgent()
        self._agent_supervisor = AgentSupervisionBudgetProfitabilityAgent()

    def _monitor_step(
        self,
        step_name: str,
        reports: list[AgentExecutionReport],
        fn: Callable[[], T],
        decisions: dict[str, Any] | None = None,
    ) -> T:
        started = perf_counter()
        try:
            result = fn()
            elapsed_ms = int((perf_counter() - started) * 1000)
            reports.append(
                AgentExecutionReport(
                    agent_name=step_name,
                    status="completed",
                    elapsed_ms=elapsed_ms,
                    decisions=decisions or {},
                )
            )
            return result
        except Exception as exc:
            elapsed_ms = int((perf_counter() - started) * 1000)
            reports.append(
                AgentExecutionReport(
                    agent_name=step_name,
                    status="failed",
                    elapsed_ms=elapsed_ms,
                    warnings=[str(exc)],
                )
            )
            raise

    @staticmethod
    def _persist_detections(prompt_id: int, detections: list[Detection]) -> None:
        for detection in detections:
            execute(
                """
                INSERT INTO detections (
                    prompt_id, type, subtype, severity, detail, span_start, span_end, confidence, layer
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    prompt_id,
                    detection.type.value,
                    detection.subtype,
                    detection.severity.value,
                    detection.detail,
                    detection.span[0],
                    detection.span[1],
                    detection.confidence,
                    detection.layer.value,
                ),
            )

    def run(self, payload: AnalyzeRequest) -> AnalyzeResponse:
        execution_report: list[AgentExecutionReport] = []

        employee_result = self._monitor_step(
            self._employee_agent.name,
            execution_report,
            lambda: self._employee_agent.run_security_exam(payload),
        )
        policy_result = self._monitor_step(
            self._policy_agent.name,
            execution_report,
            lambda: self._policy_agent.run(payload, employee_result.detections),
        )

        detections = policy_result.detections
        risk_level = choose_risk_level(detections)
        action = choose_action(risk_level)
        layer_used = DetectionLayer.l1
        confidence = 0.95 if detections else 0.99

        coaching_result = self._monitor_step(
            f"{self._employee_agent.name}.SmartCoaching",
            execution_report,
            lambda: self._employee_agent.run_smart_coaching(payload.prompt_text, detections, action),
            decisions=self._employee_agent.summarize_risk_examination(detections),
        )

        budget_result = self._monitor_step(
            self._agent_supervisor.name,
            execution_report,
            lambda: self._agent_supervisor.run(payload, detections),
        )

        metadata = {
            **(payload.metadata or {}),
            "orchestration": {
                "security_exam": employee_result.security_exam,
                "employee_role": policy_result.employee_role,
                "budget_profitability_review": budget_result.review,
            },
        }

        prompt_id = create_prompt_record(
            employee_id=payload.employee_id,
            prompt_text=payload.prompt_text,
            redacted_prompt=coaching_result.redacted_prompt,
            target_tool=payload.target_tool,
            risk_level=risk_level,
            action=action,
            layer_used=layer_used.value,
            confidence=confidence,
            estimated_cost_usd=budget_result.estimated_cost_usd,
            coaching_tip=coaching_result.tip,
            metadata=metadata,
        )
        self._persist_detections(prompt_id, detections)

        record_skill_evaluation(
            employee_id=payload.employee_id,
            prompt_id=prompt_id,
            overall_score=coaching_result.skill.overall_score,
            dimension_scores=coaching_result.skill.dimension_scores,
            strengths=coaching_result.skill.strengths,
            improvements=coaching_result.skill.improvements,
        )
        record_employee_interaction_memory(
            employee_id=payload.employee_id,
            prompt_id=prompt_id,
            risk_level=risk_level.value,
            action=action.value,
            skill_score=coaching_result.skill.overall_score,
            skill_class=coaching_result.skill.skill_class,
        )

        if employee_result.tool_domain and any(d.type.value == "shadow_ai" for d in detections):
            execute(
                "INSERT INTO shadow_ai_events (employee_id, tool_domain, risk_level, created_at) VALUES (?, ?, ?, datetime('now'))",
                (payload.employee_id, employee_result.tool_domain, RiskLevel.high.value),
            )

        if action in {ActionType.block, ActionType.quarantine}:
            create_alert("security_event", risk_level, f"Prompt {prompt_id} required {action.value}.")

        return AnalyzeResponse(
            prompt_id=prompt_id,
            risk_level=risk_level,
            action=action,
            detections=detections,
            coaching_tip=coaching_result.tip,
            redacted_prompt=coaching_result.redacted_prompt,
            layer_used=layer_used,
            confidence=confidence,
            estimated_cost_usd=budget_result.estimated_cost_usd,
            skill_evaluation=coaching_result.skill,
            orchestration_report=execution_report,
            orchestration_metadata=metadata.get("orchestration", {}),
        )
