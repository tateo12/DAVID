import logging
import os
from time import perf_counter
from typing import Any, Callable, TypeVar

from config import get_settings
from database import (
    create_alert,
    create_prompt_record,
    execute,
    fetch_one,
    fetch_rows,
    record_employee_interaction_memory,
    record_skill_evaluation,
    sql_ago,
)
from detectors.pii_detector import detect_pii
from detectors.policy_detector import detect_policy_violations
from detectors.secrets_detector import detect_secrets
from detectors.shadow_ai_detector import detect_shadow_ai
from engines.action_engine import choose_action, choose_risk_level
from engines.agents.l2_classifier_agent import L2ClassifierAgent
from engines.agents.l3_judgment_agent import L3JudgmentAgent
from engines.coaching_engine import (
    assess_intent_and_recommendations,
    coaching_tip,
    evaluate_prompt_skill,
    redact_prompt,
)
from engines.l1_triage import partition_l1_detections
from engines.policy_engine import policy_enforcement
from models import (
    ActionType,
    AgentExecutionReport,
    AnalyzeRequest,
    AnalyzeResponse,
    AttachmentContext,
    Detection,
    DetectionLayer,
    RiskLevel,
)

T = TypeVar("T")


class MainOrchestrator:
    """Central brain that coordinates security analysis, skill evaluation,
    decision-making, persistence, and automated side-effects for every
    employee prompt captured by the browser extension."""

    def __init__(self) -> None:
        self._l2_classifier = L2ClassifierAgent()
        self._l3_judgment = L3JudgmentAgent()
        self._skill_agent: Any = None
        self._email_sender: Any = None

    def set_skill_agent(self, agent: Any) -> None:
        self._skill_agent = agent

    def set_email_sender(self, sender: Any) -> None:
        self._email_sender = sender

    # -- Step monitoring -------------------------------------------------------

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

    # -- Employee context ------------------------------------------------------

    @staticmethod
    def _load_employee_context(employee_id: int) -> dict[str, Any]:
        role_row = fetch_one("SELECT role FROM employees WHERE id = ?", (employee_id,))
        role = role_row["role"] if role_row else "employee"

        memory_rows = fetch_rows(
            f"""
            SELECT risk_level, action, skill_score, skill_class
            FROM employee_interaction_memory
            WHERE employee_id = ? AND created_at >= {sql_ago(30)}
            ORDER BY created_at DESC LIMIT 20
            """,
            (employee_id,),
        )

        profile = fetch_one(
            """
            SELECT ai_skill_score, skill_class, prompts_evaluated,
                   last_coaching_message, assigned_lessons_json
            FROM employee_skill_profiles WHERE employee_id = ?
            """,
            (employee_id,),
        )

        # Load currently assigned lesson titles for coaching tip context
        assigned_lesson_titles: list[str] = []
        if profile:
            lesson_rows = fetch_rows(
                """
                SELECT sl.title
                FROM employee_lessons el
                INNER JOIN skill_lessons sl ON sl.id = el.lesson_id
                WHERE el.employee_id = ? AND el.status = 'assigned'
                ORDER BY el.id DESC LIMIT 2
                """,
                (employee_id,),
            )
            assigned_lesson_titles = [str(r["title"]) for r in lesson_rows]

        recent_violations = sum(
            1 for m in memory_rows if m["action"] in ("block", "quarantine", "redact")
        )

        return {
            "role": role,
            "recent_memory": [dict(m) for m in memory_rows],
            "skill_profile": dict(profile) if profile else None,
            "recent_violations": recent_violations,
            "is_repeat_offender": recent_violations >= 3,
            "assigned_lesson_titles": assigned_lesson_titles,
            "last_coaching_message": str(profile["last_coaching_message"] or "") if profile else "",
        }

    # -- L1 detection ----------------------------------------------------------

    @staticmethod
    def _with_source(detections: list[Detection], source: str) -> list[Detection]:
        return [d.model_copy(update={"source": source}) for d in detections]

    @staticmethod
    def _analyze_text_source(text: str, source: str, role: str) -> list[Detection]:
        if not text.strip():
            return []
        dets: list[Detection] = []
        dets.extend(MainOrchestrator._with_source(detect_pii(text), source))
        dets.extend(MainOrchestrator._with_source(detect_secrets(text), source))
        dets.extend(MainOrchestrator._with_source(detect_policy_violations(text), source))
        dets = MainOrchestrator._with_source(policy_enforcement(role, text, dets), source)
        return dets

    @staticmethod
    def _run_l1_detection(
        prompt_text: str,
        role: str,
        attachments: list[AttachmentContext],
        target_tool: str | None,
    ) -> tuple[list[Detection], str | None]:
        detections = MainOrchestrator._analyze_text_source(prompt_text, "prompt", role)

        for idx, attachment in enumerate(attachments):
            att_text = (attachment.extracted_text or "").strip()
            if att_text:
                source = f"attachment:{idx}:{attachment.filename}"
                detections.extend(MainOrchestrator._analyze_text_source(att_text, source, role))

        shadow_hits, tool_domain = detect_shadow_ai(target_tool)
        detections.extend(MainOrchestrator._with_source(shadow_hits, "tool"))

        return detections, tool_domain

    # -- Escalation logic ------------------------------------------------------

    @staticmethod
    def _openrouter_configured() -> bool:
        s = get_settings()
        return bool((s.openrouter_api_key or "").strip() or (os.getenv("API_SECRET_KEY") or "").strip())

    @staticmethod
    def _needs_l2() -> bool:
        """Prefer LLM classification whenever L2 is enabled and a model key exists."""
        if not get_settings().enable_l2:
            return False
        return MainOrchestrator._openrouter_configured()

    @staticmethod
    def _needs_l3_after_l2(
        risk_level: RiskLevel,
        l2_applied: bool,
        l2_result: Any,
    ) -> bool:
        """L3 adjudicates elevated risk, any findings, or non-trivial L2 output — not every clean prompt."""
        if not get_settings().enable_l3:
            return False
        if not MainOrchestrator._openrouter_configured():
            return False
        if risk_level != RiskLevel.low:
            return True
        if not l2_applied or not l2_result:
            return False
        if getattr(l2_result, "additional_detections", None):
            return True
        adj = (getattr(l2_result, "risk_adjustment", None) or "").lower().strip()
        return bool(adj and adj != "none")

    # -- Confidence calculation ------------------------------------------------

    @staticmethod
    def _base_confidence(detections: list[Detection]) -> float:
        if not detections:
            return 0.99
        avg_conf = sum(d.confidence for d in detections) / len(detections)
        volume_penalty = min(0.08, max(0, len(detections) - 3) * 0.01)
        return max(0.55, min(0.99, avg_conf - volume_penalty))

    # -- Persistence -----------------------------------------------------------

    @staticmethod
    def _persist_detections(prompt_id: int, detections: list[Detection]) -> None:
        for d in detections:
            execute(
                """
                INSERT INTO detections (
                    prompt_id, type, subtype, severity, detail,
                    span_start, span_end, confidence, layer
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    prompt_id,
                    d.type.value,
                    d.subtype,
                    d.severity.value,
                    d.detail,
                    d.span[0],
                    d.span[1],
                    d.confidence,
                    d.layer.value,
                ),
            )

    # -- Main entry point ------------------------------------------------------

    def run(self, payload: AnalyzeRequest) -> AnalyzeResponse:
        execution_report: list[AgentExecutionReport] = []
        estimated_cost = 0.0

        # 1. Load employee context (history, skill profile, repeat-offender flag)
        ctx = self._monitor_step(
            "ContextLoader",
            execution_report,
            lambda: self._load_employee_context(payload.employee_id),
        )
        role = ctx["role"]

        # 2. L1 regex/rule detection (full list kept for L2 context + persistence; risk from blatant hits only)
        detections, tool_domain = self._monitor_step(
            "L1_RegexDetection",
            execution_report,
            lambda: self._run_l1_detection(
                payload.prompt_text, role, payload.attachments, payload.target_tool
            ),
        )
        blatant_l1, soft_l1 = partition_l1_detections(detections)
        risk_level = choose_risk_level(blatant_l1)
        action = choose_action(risk_level)
        layer_used = DetectionLayer.l1
        confidence = self._base_confidence(blatant_l1 if blatant_l1 else soft_l1)

        # Escalate repeat offenders from medium to high
        if ctx["is_repeat_offender"] and risk_level == RiskLevel.medium:
            risk_level = RiskLevel.high
            action = choose_action(risk_level)

        # 3. L2 classification (runs for essentially all prompts when configured — primary reasoning pass)
        l2_result = None
        if self._needs_l2():
            l2_result = self._monitor_step(
                "L2_Classifier",
                execution_report,
                lambda: self._l2_classifier.run(
                    payload.prompt_text, detections, confidence
                ),
            )
            if l2_result.applied:
                if l2_result.additional_detections:
                    detections.extend(
                        self._with_source(l2_result.additional_detections, "prompt")
                    )
                    risk_level = choose_risk_level(detections)
                    action = choose_action(risk_level)
                    confidence = max(0.6, min(confidence, 0.9))
                    layer_used = DetectionLayer.l2
                estimated_cost += (
                    l2_result.estimated_cost_usd
                    if l2_result.estimated_cost_usd > 0
                    else 0.001
                )

        # 4. L3 judgment (targeted — not duplicated on every no-issue prompt)
        l3_result = None
        l2_applied = bool(l2_result and l2_result.applied)
        if self._needs_l3_after_l2(risk_level, l2_applied, l2_result):
            l3_result = self._monitor_step(
                "L3_Judgment",
                execution_report,
                lambda: self._l3_judgment.run(
                    payload.prompt_text, risk_level, action, detections
                ),
            )
            if (
                l3_result.applied
                and l3_result.risk_level
                and l3_result.action
                and l3_result.confidence is not None
            ):
                risk_level = l3_result.risk_level
                action = l3_result.action
                confidence = l3_result.confidence
                layer_used = DetectionLayer.l3
                estimated_cost += (
                    l3_result.estimated_cost_usd
                    if l3_result.estimated_cost_usd > 0
                    else 0.01
                )

        # 5. Skill evaluation + coaching
        prompt_detections = [d for d in detections if d.source == "prompt"]
        redacted = (
            redact_prompt(payload.prompt_text, prompt_detections)
            if action == ActionType.redact
            else None
        )

        if self._skill_agent is not None:
            try:
                skill = self._monitor_step(
                    "SkillAnalysisAgent",
                    execution_report,
                    lambda: self._skill_agent.run(
                        payload.prompt_text, detections, ctx.get("skill_profile")
                    ),
                )
            except Exception:
                skill = self._monitor_step(
                    "SkillEvaluation_Fallback",
                    execution_report,
                    lambda: evaluate_prompt_skill(payload.prompt_text, detections),
                )
        else:
            skill = self._monitor_step(
                "SkillEvaluation",
                execution_report,
                lambda: evaluate_prompt_skill(payload.prompt_text, detections),
            )

        tip = coaching_tip(action, detections, skill)

        # Append active lesson reference so every coaching response acknowledges the curriculum
        lesson_titles = ctx.get("assigned_lesson_titles", [])
        if lesson_titles:
            lessons_str = " | ".join(f'"{t}"' for t in lesson_titles[:2])
            tip = f"{tip} [Active learning: {lessons_str}]"

        intent_assessment, warning_reasons, safer_alternatives = (
            assess_intent_and_recommendations(
                payload.prompt_text,
                detections,
                attachment_count=len(payload.attachments),
            )
        )

        # 6. Build orchestration metadata
        orchestration_meta = {
            "l1_triage": {
                "blatant_count": len(blatant_l1),
                "soft_count": len(soft_l1),
                "note": "Risk/action from blatant L1 only; soft regex hits await LLM review.",
            },
            "employee_context": {
                "role": role,
                "recent_violations": ctx["recent_violations"],
                "is_repeat_offender": ctx["is_repeat_offender"],
                "skill_class": (
                    ctx["skill_profile"]["skill_class"]
                    if ctx["skill_profile"]
                    else "unknown"
                ),
            },
            "l2_classification": {
                "applied": l2_result.applied if l2_result else False,
                "additional_detections": (
                    len(l2_result.additional_detections) if l2_result else 0
                ),
                "risk_adjustment": l2_result.risk_adjustment if l2_result else None,
                "rationale": l2_result.rationale if l2_result else None,
            },
            "l3_judgment": {
                "applied": l3_result.applied if l3_result else False,
                "rationale": l3_result.rationale if l3_result else None,
            },
        }
        metadata = {**(payload.metadata or {}), "orchestration": orchestration_meta}

        prompt_id = 0
        if payload.persist_prompt:
            # 7. Persist prompt, detections, skill, memory
            prompt_id = create_prompt_record(
                employee_id=payload.employee_id,
                prompt_text=payload.prompt_text,
                redacted_prompt=redacted,
                target_tool=payload.target_tool,
                risk_level=risk_level,
                action=action,
                layer_used=layer_used.value,
                confidence=confidence,
                estimated_cost_usd=estimated_cost,
                coaching_tip=tip,
                metadata=metadata,
            )
            self._persist_detections(prompt_id, detections)

            record_skill_evaluation(
                employee_id=payload.employee_id,
                prompt_id=prompt_id,
                overall_score=skill.overall_score,
                dimension_scores=skill.dimension_scores,
                strengths=skill.strengths,
                improvements=skill.improvements,
                coaching_message=skill.coaching_message,
                ai_use_profile_summary=skill.ai_use_profile_summary or "",
            )
            record_employee_interaction_memory(
                employee_id=payload.employee_id,
                prompt_id=prompt_id,
                risk_level=risk_level.value,
                action=action.value,
                skill_score=skill.overall_score,
                skill_class=skill.skill_class,
            )

            # 8. Shadow AI tracking
            if tool_domain and any(d.type.value == "shadow_ai" for d in detections):
                execute(
                    "INSERT INTO shadow_ai_events (employee_id, tool_domain, risk_level, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                    (payload.employee_id, tool_domain, RiskLevel.high.value),
                )

            # 9. Automated side-effects: alert + security email on block/quarantine
            if action in {ActionType.block, ActionType.quarantine}:
                create_alert(
                    "security_event",
                    risk_level,
                    f"Prompt {prompt_id} required {action.value}.",
                )
                if self._email_sender is not None:
                    try:
                        self._email_sender.send_security_alert(
                            employee_id=payload.employee_id,
                            prompt_id=prompt_id,
                            risk_level=risk_level,
                            action=action,
                            detections=detections,
                        )
                    except Exception as exc:
                        logging.getLogger(__name__).warning("security email send failed: %s", exc)

        return AnalyzeResponse(
            prompt_id=prompt_id,
            risk_level=risk_level,
            action=action,
            detections=detections,
            coaching_tip=tip,
            redacted_prompt=redacted,
            layer_used=layer_used,
            confidence=confidence,
            estimated_cost_usd=estimated_cost,
            skill_evaluation=skill,
            warning_reasons=warning_reasons,
            safer_alternatives=safer_alternatives,
            intent_assessment=intent_assessment,
            orchestration_report=execution_report,
            orchestration_metadata=orchestration_meta,
        )
