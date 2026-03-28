import json
import os
from typing import Any

import requests

from config import get_settings, openrouter_chat_completions_url
from engines.agents.contracts import L2ClassificationResult
from models import Detection, DetectionLayer, DetectionType, RiskLevel


class L2ClassifierAgent:
    name = "L2ClassifierAgent"

    def _get_api_key(self) -> str:
        settings = get_settings()
        return settings.openrouter_api_key or os.getenv("API_SECRET_KEY", "")

    def _should_classify(self, detections: list[Detection], confidence: float) -> bool:
        settings = get_settings()
        if not settings.enable_l2:
            return False
        if not self._get_api_key():
            return False
        return True

    @staticmethod
    def _build_prompt(prompt_text: str, detections: list[Detection]) -> str:
        summary = [
            {"type": d.type.value, "subtype": d.subtype, "severity": d.severity.value, "confidence": d.confidence}
            for d in detections[:15]
        ]
        return json.dumps({
            "prompt_text": prompt_text[:6000],
            "l1_detections": summary,
            "l1_detection_count": len(detections),
        })

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

    def run(self, prompt_text: str, detections: list[Detection], l1_confidence: float) -> L2ClassificationResult:
        if not self._should_classify(detections, l1_confidence):
            return L2ClassificationResult(applied=False)

        settings = get_settings()
        api_key = self._get_api_key()

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.openrouter_site_url,
            "X-Title": settings.openrouter_app_name,
        }
        payload = {
            "model": settings.l2_model_name,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are the primary semantic security reviewer for enterprise AI prompts. "
                        "L1 regex output includes many soft/false-positive signals (e.g. normal emails, generic keywords). "
                        "Do not treat L1 as ground truth — read the full prompt and decide real risk. "
                        "Confirm true issues, add missed risks, or dismiss noise. "
                        "Respond with strict JSON only: "
                        "missed_risks (array of {type, subtype, severity, detail}), "
                        "risk_adjustment (one of: none, upgrade, downgrade), "
                        "rationale (short string). "
                        "Types: pii, secret, policy, shadow_ai. Severities: low, medium, high, critical."
                    ),
                },
                {
                    "role": "user",
                    "content": self._build_prompt(prompt_text, detections),
                },
            ],
        }
        try:
            response = requests.post(
                openrouter_chat_completions_url(),
                headers=headers,
                json=payload,
                timeout=25,
            )
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]["content"]
            parsed = self._parse_json_content(message)

            additional: list[Detection] = []
            for risk in parsed.get("missed_risks", [])[:10]:
                try:
                    additional.append(Detection(
                        type=DetectionType(risk.get("type", "policy")),
                        subtype=str(risk.get("subtype", "l2_finding")),
                        severity=RiskLevel(risk.get("severity", "medium")),
                        detail=str(risk.get("detail", "Identified by L2 classifier"))[:500],
                        span=(0, 0),
                        confidence=0.75,
                        layer=DetectionLayer.l2,
                    ))
                except (ValueError, KeyError):
                    continue

            return L2ClassificationResult(
                applied=True,
                additional_detections=additional,
                risk_adjustment=str(parsed.get("risk_adjustment", "none")),
                rationale=str(parsed.get("rationale", ""))[:500],
                estimated_cost_usd=0.0,
            )
        except Exception as exc:
            return L2ClassificationResult(applied=False, warnings=[f"L2 fallback: {exc}"])
