from models import ActionType, Detection, IntentAssessment, PromptSkillEvaluation, RiskLevel


def skill_class_from_score(score: float) -> str:
    if score < 0.45:
        return "novice"
    if score < 0.65:
        return "developing"
    if score < 0.82:
        return "proficient"
    return "advanced"


def redact_prompt(prompt_text: str, detections: list[Detection]) -> str:
    redacted = prompt_text
    for detection in sorted(detections, key=lambda d: d.span[0], reverse=True):
        start, end = detection.span
        if end <= start:
            continue
        redacted = f"{redacted[:start]}[REDACTED_{detection.subtype.upper()}]{redacted[end:]}"
    return redacted


def evaluate_prompt_skill(prompt_text: str, detections: list[Detection]) -> PromptSkillEvaluation:
    text = prompt_text.strip()
    lowered = text.lower()
    words = [w for w in text.split() if w]
    word_count = len(words)

    objective_keywords = ["summarize", "draft", "analyze", "compare", "explain", "generate", "rewrite", "classify"]
    constraint_keywords = ["format", "bullet", "steps", "tone", "length", "limit", "json", "table"]
    context_markers = ["for", "about", "context", "background", "audience", "goal", "because"]
    quality_markers = ["example", "criteria", "must", "should", "avoid"]

    objective = 1.0 if any(k in lowered for k in objective_keywords) else 0.4
    context = 1.0 if any(k in lowered for k in context_markers) else 0.35
    constraints = 1.0 if any(k in lowered for k in constraint_keywords) else 0.3
    specificity = min(1.0, max(0.2, word_count / 35.0))
    quality = 1.0 if any(k in lowered for k in quality_markers) else 0.5

    risk_penalty = 0.0
    if detections:
        if any(d.severity == RiskLevel.critical for d in detections):
            risk_penalty = 0.25
        elif any(d.severity == RiskLevel.high for d in detections):
            risk_penalty = 0.15
        else:
            risk_penalty = 0.08

    weighted = (
        (objective * 0.2)
        + (context * 0.2)
        + (constraints * 0.2)
        + (specificity * 0.25)
        + (quality * 0.15)
        - risk_penalty
    )
    overall = max(0.0, min(1.0, weighted))

    dimensions = {
        "objective_clarity": round(objective, 3),
        "context_richness": round(context, 3),
        "constraints_defined": round(constraints, 3),
        "specificity": round(specificity, 3),
        "instruction_quality": round(quality, 3),
    }

    strengths: list[str] = []
    improvements: list[str] = []
    if objective >= 0.9:
        strengths.append("Clear objective is present.")
    else:
        improvements.append("State the exact task outcome you want from the AI.")
    if context >= 0.9:
        strengths.append("Prompt includes useful business context.")
    else:
        improvements.append("Add business background and intended audience.")
    if constraints >= 0.9:
        strengths.append("Output constraints are clearly defined.")
    else:
        improvements.append("Specify output format, tone, and length constraints.")
    if specificity >= 0.7:
        strengths.append("Prompt is sufficiently specific for reliable output.")
    else:
        improvements.append("Increase specificity with concrete details and scope.")
    if detections:
        improvements.append("Remove sensitive data and use placeholders before submitting.")

    coaching_message = (
        "Strong prompt craft. Keep adding explicit constraints for even better consistency."
        if overall >= 0.75
        else "Improve clarity, context, and output constraints to raise answer quality and reduce retries."
    )

    return PromptSkillEvaluation(
        overall_score=round(overall, 3),
        skill_class=skill_class_from_score(overall),
        dimension_scores=dimensions,
        strengths=strengths[:3],
        improvements=improvements[:4],
        coaching_message=coaching_message,
        ai_use_profile_summary="",
    )


def coaching_tip(action: ActionType, detections: list[Detection], skill: PromptSkillEvaluation) -> str | None:
    if action == ActionType.allow and not detections:
        return skill.coaching_message
    if action == ActionType.block:
        return (
            "This prompt was blocked because it appears to contain critical sensitive data. "
            "Remove identifiers and secrets, then retry. "
            f"Skill coaching: {skill.coaching_message}"
        )
    if action == ActionType.redact:
        return (
            "Sensitive content was auto-redacted. Use generalized placeholders instead of real identifiers. "
            f"Skill coaching: {skill.coaching_message}"
        )
    return f"Review policy guidelines before sharing internal or customer information with AI tools. Skill coaching: {skill.coaching_message}"


def assess_intent_and_recommendations(
    prompt_text: str,
    detections: list[Detection],
    attachment_count: int = 0,
) -> tuple[IntentAssessment, list[str], list[str]]:
    lowered = prompt_text.lower().strip()
    objective_markers = ["summarize", "draft", "analyze", "rewrite", "explain", "compare", "classify", "generate"]
    has_objective = any(marker in lowered for marker in objective_markers)

    high_or_critical = [d for d in detections if d.severity in {RiskLevel.high, RiskLevel.critical}]
    pii_or_secrets = [d for d in detections if d.subtype.startswith("ssn") or d.type.value in {"pii", "secret"}]

    objective_clarity = "clear" if has_objective and len(prompt_text.split()) >= 8 else "unclear"
    oversharing_risk = "high" if (attachment_count > 0 and pii_or_secrets) or len(high_or_critical) > 0 else "low"

    reasons: list[str] = []
    if high_or_critical:
        reasons.append("High-severity sensitive patterns were detected in your prompt or attachment text.")
    if pii_or_secrets:
        reasons.append("Personal data or credential-like content appears in the content being shared.")
    if attachment_count > 1:
        reasons.append("Multiple attachments increase exposure risk if full files are shared.")
    if not reasons and detections:
        reasons.append("Potential policy-sensitive content was detected.")

    alternatives: list[str] = []
    if pii_or_secrets:
        alternatives.append("Share a redacted excerpt with placeholders instead of real identifiers.")
    if attachment_count:
        alternatives.append("Upload only the minimal section needed for the task, not the whole document.")
    if objective_clarity == "unclear":
        alternatives.append("Rewrite the prompt with a clear outcome and constraints before attaching data.")
    alternatives.append("Use a synthetic sample that preserves structure without exposing production data.")

    recommendation = alternatives[0] if alternatives else "Limit shared data to the minimum needed for the task."
    return (
        IntentAssessment(
            objective_clarity=objective_clarity,
            oversharing_risk=oversharing_risk,
            recommendation=recommendation,
        ),
        reasons[:4],
        alternatives[:4],
    )
