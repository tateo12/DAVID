"""
Agent 1 – Security Risk Scorer
================================
Runs in the background after every persisted prompt.

Computes a nuanced, recency-weighted security risk score (0–100, stored as 0.0–1.0
in employees.risk_score) that reflects:

  • Recency-weighted risk-level penalties   (recent violations hurt more)
  • Detection-type penalties                (secrets > PII > shadow_ai > policy)
  • Repeat-pattern penalty                  (same detection subtype 3+ times in 7 days)
  • Trend bonus/penalty                     (improving vs deteriorating over 14 days)

The computed 0–1 risk_score drives the front-end employee risk display and the
dashboard Health Score.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from database import execute, fetch_one, fetch_rows

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scoring constants
# ---------------------------------------------------------------------------

# Per-prompt risk-level base penalties (multiplied by recency weight)
_RISK_PENALTY: dict[str, float] = {
    "critical": 22.0,
    "high": 11.0,
    "medium": 3.5,
    "low": 0.0,
}

# Per-detection-type penalties applied over the last 7 days (capped per type)
_DETECTION_PENALTY: dict[str, float] = {
    "secret": 9.0,
    "pii": 5.0,
    "shadow_ai": 6.0,
    "policy": 3.0,
}
_DETECTION_CAP: dict[str, float] = {
    "secret": 36.0,
    "pii": 25.0,
    "shadow_ai": 18.0,
    "policy": 12.0,
}

# Extra penalty when the same detection *subtype* recurs 3+ times in 7 days
_REPEAT_PATTERN_PENALTY = 10.0

# Trend bonus: if the last-7-day avg risk is strictly lower than prior-7-day avg risk
_TREND_BONUS = 5.0
# Trend extra penalty: if getting worse
_TREND_PENALTY = 5.0


def _days_ago(iso_ts: str) -> float:
    """Return fractional days between now and an ISO timestamp string."""
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - dt
        return max(0.0, delta.total_seconds() / 86400.0)
    except Exception:
        return 15.0  # assume mid-range if unparseable


def _recency_weight(days: float, window: float = 30.0) -> float:
    """
    Recent events count fully; events at the edge of the window count at 0.3.
    Linear interpolation: 1.0 at day 0, 0.3 at day ``window``.
    """
    return max(0.3, 1.0 - (days / window) * 0.7)


def _compute_score(employee_id: int) -> float:
    """
    Compute a 0–100 security *health* score (higher = safer).
    Returned value is later inverted to a 0–1 risk_score.
    """
    score = 100.0

    # ── 1. Recency-weighted prompt risk penalties (30-day window) ──────────
    prompt_rows = fetch_rows(
        """
        SELECT risk_level, created_at
        FROM prompts
        WHERE employee_id = ?
          AND created_at >= datetime('now', '-30 day')
        ORDER BY created_at DESC
        LIMIT 60
        """,
        (employee_id,),
    )

    for row in prompt_rows:
        days = _days_ago(str(row["created_at"]))
        weight = _recency_weight(days)
        penalty = _RISK_PENALTY.get(str(row["risk_level"]).lower(), 0.0)
        score -= penalty * weight

    # ── 2. Detection-type penalties (7-day window) ─────────────────────────
    detection_rows = fetch_rows(
        """
        SELECT d.type, d.subtype, COUNT(1) AS c
        FROM detections d
        INNER JOIN prompts p ON p.id = d.prompt_id
        WHERE p.employee_id = ?
          AND p.created_at >= datetime('now', '-7 day')
        GROUP BY d.type, d.subtype
        """,
        (employee_id,),
    )

    type_totals: dict[str, float] = {}
    subtype_counts: dict[str, int] = {}
    for row in detection_rows:
        det_type = str(row["type"]).lower()
        subtype = f"{det_type}:{str(row['subtype']).lower()}"
        count = int(row["c"] or 0)
        raw_penalty = _DETECTION_PENALTY.get(det_type, 2.0) * count
        cap = _DETECTION_CAP.get(det_type, 10.0)
        type_totals[det_type] = min(
            type_totals.get(det_type, 0.0) + raw_penalty, cap
        )
        subtype_counts[subtype] = subtype_counts.get(subtype, 0) + count

    for penalty in type_totals.values():
        score -= penalty

    # ── 3. Repeat-pattern penalty ──────────────────────────────────────────
    for subtype, count in subtype_counts.items():
        if count >= 3:
            score -= _REPEAT_PATTERN_PENALTY

    # ── 4. Trend adjustment ────────────────────────────────────────────────
    # Compare average risk-level score for last 7 days vs prior 7 days
    def _avg_risk(sql_filter: str) -> float | None:
        row = fetch_one(
            f"""
            SELECT AVG(
                CASE risk_level
                    WHEN 'critical' THEN 1.0
                    WHEN 'high'     THEN 0.75
                    WHEN 'medium'   THEN 0.5
                    ELSE 0.15
                END
            ) AS avg_r
            FROM prompts
            WHERE employee_id = ? AND {sql_filter}
            """,
            (employee_id,),
        )
        if not row or row["avg_r"] is None:
            return None
        return float(row["avg_r"])

    cur_avg = _avg_risk("created_at >= datetime('now', '-7 day')")
    prev_avg = _avg_risk(
        "created_at >= datetime('now', '-14 day') AND created_at < datetime('now', '-7 day')"
    )
    if cur_avg is not None and prev_avg is not None:
        if cur_avg < prev_avg - 0.05:
            score += _TREND_BONUS    # improving
        elif cur_avg > prev_avg + 0.05:
            score -= _TREND_PENALTY  # worsening

    return max(0.0, min(100.0, score))


class SecurityRiskAgent:
    """Recomputes and persists an employee's risk score after a prompt event."""

    def run(self, employee_id: int) -> None:
        try:
            health = _compute_score(employee_id)
            # Invert: health=100 → risk_score=0.0 (safest)
            #         health=0   → risk_score=1.0 (most risky)
            risk_score = round(1.0 - health / 100.0, 4)
            execute(
                "UPDATE employees SET risk_score = ? WHERE id = ?",
                (risk_score, employee_id),
            )
            log.debug(
                "SecurityRiskAgent: employee=%d  health=%.1f  risk_score=%.4f",
                employee_id,
                health,
                risk_score,
            )
        except Exception as exc:
            log.warning("SecurityRiskAgent failed for employee %d: %s", employee_id, exc)
