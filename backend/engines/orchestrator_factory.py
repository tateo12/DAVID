"""Singleton factory for the MainOrchestrator.

All route modules import `get_orchestrator()` from here to get a shared,
fully-configured orchestrator instance with the SkillAnalysisAgent and
EmailSender already wired in.
"""

import logging
from typing import Optional

from engines.agents.main_orchestrator import MainOrchestrator

log = logging.getLogger(__name__)

_instance: Optional[MainOrchestrator] = None


def get_orchestrator() -> MainOrchestrator:
    global _instance
    if _instance is not None:
        return _instance

    orchestrator = MainOrchestrator()

    try:
        from engines.agents.skill_analysis_agent import SkillAnalysisAgent
        orchestrator.set_skill_agent(SkillAnalysisAgent())
        log.info("SkillAnalysisAgent attached to orchestrator")
    except Exception as exc:
        log.warning("SkillAnalysisAgent unavailable, using heuristic fallback: %s", exc)

    try:
        from engines.email_sender import EmailSender
        orchestrator.set_email_sender(EmailSender())
        log.info("EmailSender attached to orchestrator")
    except Exception as exc:
        log.warning("EmailSender unavailable: %s", exc)

    _instance = orchestrator
    return _instance
