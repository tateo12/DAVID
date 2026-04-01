"""
Orchestration Queue
===================
Dispatches background agents after a prompt is persisted.

Called as a FastAPI BackgroundTask so it runs after the HTTP response is sent.
Both agents are guarded by individual try/except so one failure never blocks the other.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def dispatch_post_analysis(employee_id: int, prompt_id: int) -> None:
    """
    Fire Agent 1 (SecurityRiskAgent) and Agent 2 (LearningAdvisorAgent) for the
    given employee after a prompt has been persisted.

    prompt_id is accepted for logging / future tracing but not used by the agents
    themselves — they always operate on the full employee history.
    """
    log.debug("orchestration_queue: dispatching agents for employee=%d prompt=%d", employee_id, prompt_id)

    # Agent 1 – recompute and persist the employee's risk score
    try:
        from engines.agents.security_risk_agent import SecurityRiskAgent
        SecurityRiskAgent().run(employee_id)
    except Exception as exc:
        log.warning("SecurityRiskAgent dispatch failed for employee=%d: %s", employee_id, exc)

    # Agent 2 – update coaching message with lesson references and pattern analysis
    try:
        from engines.agents.learning_advisor_agent import LearningAdvisorAgent
        LearningAdvisorAgent().run(employee_id)
    except Exception as exc:
        log.warning("LearningAdvisorAgent dispatch failed for employee=%d: %s", employee_id, exc)
