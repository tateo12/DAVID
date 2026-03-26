import json
import os
from typing import Any

import requests

from config import get_settings
from engines.agents.contracts import L3JudgmentResult
from models import ActionType, Detection, RiskLevel


class L3JudgmentAgent:
    name = "L3JudgmentAgent"

    def _get_api_key(self) -> str:
        settings = get_settings()
        return settings.openrouter_api_key or os.getenv("API_SECRET_KEY", "")

    def _should_escalate(self, risk_level: RiskLevel, detections: list[Detection]) -> bool:
        settings = get_settings()
        if not settings.enable_l3:
            return False
        if not self._get_api_key():
            return False
        return risk_level in {RiskLevel.medium, RiskLevel.high, RiskLevel.critical} or len(detections) == 0

    @staticmethod
    def _detection_summary(detections: list[Detection]) -> list[dict[str, Any]]:
        return [
            {
                "type": d.type.value,
                "subtype": d.subtype,
                "severity": d.severity.value,
                "detail": d.detail,
                "confidence": d.confidence,
            }
            for d in detections[:20]
        ]

    @staticmethod
    def _parse_json_content(content: str) -> dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start >= 0 and end > start:
                return json.loads(content[start : end + 1])
            raise

    def run(self, prompt_text: str, risk_level: RiskLevel, action: ActionType, detections: list[Detection]) -> L3JudgmentResult:
        if not self._should_escalate(risk_level, detections):
            return L3JudgmentResult(applied=False)

        settings = get_settings()
        api_key = self._get_api_key()

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.openrouter_site_url,
            "X-Title": settings.openrouter_app_name,
        }
        payload = {
            "model": settings.l3_model_name,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a security adjudication model for enterprise AI prompt safety. "
                        "You receive a prompt, its current risk assessment, and all detections. "
                        "Make a final judgment on the correct risk level and action. "
                        "Respond with strict JSON only using keys: risk_level, action, confidence, rationale. "
                        "Allowed risk_level: low, medium, high, critical. "
                        "Allowed action: allow, redact, quarantine, block."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "prompt_text": prompt_text[:8000],
                        "l1_risk_level": risk_level.value,
                        "l1_action": action.value,
                        "detections": self._detection_summary(detections),
                    }),
                },
            ],
        }
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]["content"]
            parsed = self._parse_json_content(message)

            parsed_risk = RiskLevel(str(parsed.get("risk_level", risk_level.value)))
            parsed_action = ActionType(str(parsed.get("action", action.value)))
            parsed_confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.8))))

            return L3JudgmentResult(
                applied=True,
                risk_level=parsed_risk,
                action=parsed_action,
                confidence=parsed_confidence,
                rationale=str(parsed.get("rationale", ""))[:1000],
                estimated_cost_usd=0.0,
            )
        except Exception as exc:
            return L3JudgmentResult(applied=False, warnings=[f"L3 fallback: {exc}"])
