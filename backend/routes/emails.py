"""Email rendering endpoints — preview & simulated send for Sentinel demo."""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from auth import require_ops_manager

from config import frontend_base_url
from database import execute, fetch_one, fetch_rows

router = APIRouter(prefix="/emails", tags=["emails"])

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = (
    _PROJECT_ROOT / "integrations" / "email" / "templates"
    if (_PROJECT_ROOT / "integrations" / "email" / "templates").is_dir()
    else _BACKEND_ROOT / "email_templates"
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Minimal template engine (no Jinja2 dependency)
# Handles: {{ var }}, {% if cond %}...{% elif cond %}...{% else %}...{% endif %},
#          {% for item in list %}...{% endfor %}, and simple filters (.startswith, |float)
# ---------------------------------------------------------------------------

def _resolve_value(expr: str, ctx: dict[str, Any]) -> Any:
    """Resolve a dotted expression like 'emp.name' or 'detection.severity' against ctx."""
    expr = expr.strip()
    parts = expr.split(".")
    val: Any = ctx
    for part in parts:
        if isinstance(val, dict):
            val = val.get(part)
        else:
            val = getattr(val, part, None)
        if val is None:
            return ""
    return val


def _eval_condition(cond: str, ctx: dict[str, Any]) -> bool:
    """Evaluate a simple template condition.

    Supported forms:
      severity == 'critical'
      action_taken == 'Blocked'
      emp.risk_score >= 80
      prompts_trend.startswith('+')
      soc2_status == 'compliant'
      prompt_truncated  (truthy check)
    """
    cond = cond.strip()

    # Handle .startswith('x')
    m = re.match(r"(.+?)\.startswith\(\s*'([^']*)'\s*\)", cond)
    if m:
        val = str(_resolve_value(m.group(1), ctx))
        return val.startswith(m.group(2))

    # Handle == comparison
    m = re.match(r"(.+?)\s*==\s*'([^']*)'", cond)
    if m:
        val = str(_resolve_value(m.group(1), ctx))
        return val == m.group(2)

    # Handle >= comparison
    m = re.match(r"(.+?)\s*>=\s*(\d+(?:\.\d+)?)", cond)
    if m:
        try:
            val = float(_resolve_value(m.group(1), ctx))
        except (ValueError, TypeError):
            val = 0.0
        return val >= float(m.group(2))

    # Handle |float >= comparison (e.g., dept.flag_rate|float >= 15)
    m = re.match(r"(.+?)\|float\s*>=\s*(\d+(?:\.\d+)?)", cond)
    if m:
        try:
            val = float(_resolve_value(m.group(1), ctx))
        except (ValueError, TypeError):
            val = 0.0
        return val >= float(m.group(2))

    # Truthy check
    val = _resolve_value(cond, ctx)
    return bool(val)


def _process_ifs(html: str, ctx: dict[str, Any]) -> str:
    """Process {% if %}{% elif %}{% else %}{% endif %} blocks (non-nested)."""
    pattern = re.compile(
        r"\{%\s*if\s+(.+?)\s*%\}(.*?)"
        r"(?:\{%\s*elif\s+(.+?)\s*%\}(.*?))?"
        r"(?:\{%\s*elif\s+(.+?)\s*%\}(.*?))?"
        r"(?:\{%\s*elif\s+(.+?)\s*%\}(.*?))?"
        r"(?:\{%\s*else\s*%\}(.*?))?"
        r"\{%\s*endif\s*%\}",
        re.DOTALL,
    )

    def _replace(m: re.Match) -> str:
        # Check if branch
        if _eval_condition(m.group(1), ctx):
            return m.group(2) or ""
        # Check elif branches (up to 3)
        for i in range(3, 9, 2):
            cond = m.group(i)
            body = m.group(i + 1)
            if cond and _eval_condition(cond, ctx):
                return body or ""
        # else branch
        if m.group(9) is not None:
            return m.group(9)
        return ""

    return pattern.sub(_replace, html)


def _process_for(html: str, ctx: dict[str, Any]) -> str:
    """Process {% for item in list %}...{% endfor %} blocks."""
    pattern = re.compile(r"\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}(.*?)\{%\s*endfor\s*%\}", re.DOTALL)

    def _replace(m: re.Match) -> str:
        var_name = m.group(1)
        list_name = m.group(2)
        body_template = m.group(3)
        items = ctx.get(list_name, [])
        parts = []
        for item in items:
            inner_ctx = {**ctx, var_name: item}
            rendered = _process_ifs(body_template, inner_ctx)
            rendered = _substitute_vars(rendered, inner_ctx)
            parts.append(rendered)
        return "".join(parts)

    return pattern.sub(_replace, html)


def _substitute_vars(html: str, ctx: dict[str, Any]) -> str:
    """Replace {{ expr }} placeholders with values from ctx."""

    def _replace(m: re.Match) -> str:
        expr = m.group(1).strip()
        val = _resolve_value(expr, ctx)
        return str(val) if val is not None else ""

    return re.sub(r"\{\{\s*(.+?)\s*\}\}", _replace, html)


def render_template(name: str, ctx: dict[str, Any]) -> str:
    """Load an HTML template and render it with the given context dict."""
    path = TEMPLATE_DIR / name
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Template {name} not found at {path}")
    html = path.read_text()
    html = _process_for(html, ctx)
    html = _process_ifs(html, ctx)
    html = _substitute_vars(html, ctx)
    return html


# ---------------------------------------------------------------------------
# Coaching tips by detection type — used when no coaching_tip stored
# ---------------------------------------------------------------------------

COACHING_TIPS: dict[str, str] = {
    "pii": "Never paste personal information (SSNs, phone numbers, addresses) into AI tools. Use placeholder values like [EMPLOYEE_SSN] instead.",
    "secret": "API keys, passwords, and tokens should never appear in prompts. Reference them by name or use a secrets manager.",
    "policy": "Avoid mentioning confidential project names or internal URLs in AI prompts. Rephrase using generic descriptions.",
    "shadow_ai": "Use only company-approved AI tools. Unauthorized tools may not meet our security and data-handling standards.",
}

SAFE_EXAMPLES: dict[str, str] = {
    "pii": "\"Summarize the employee record for [EMPLOYEE_NAME] with ID [REDACTED].\"",
    "secret": "\"Connect to the database using the credentials stored in our vault under 'prod-db-readonly'.\"",
    "policy": "\"Analyze the Q3 performance data for the project (see internal reference).\"",
    "shadow_ai": "\"Use the company-approved AI assistant at assistant.acme.corp to draft this email.\"",
}


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _get_employee_or_404(employee_id: int) -> dict[str, Any]:
    emp = fetch_one("SELECT id, name, department, role, risk_score FROM employees WHERE id = ?", (employee_id,))
    if not emp:
        raise HTTPException(status_code=404, detail=f"Employee {employee_id} not found")
    return dict(emp)


# ---------------------------------------------------------------------------
# 1. GET /api/emails/preview/coaching?employee_id=1
# ---------------------------------------------------------------------------

@router.get("/preview/coaching", response_class=HTMLResponse)
def preview_coaching_email(employee_id: int, _current_user: dict = Depends(require_ops_manager)) -> HTMLResponse:
    emp = _get_employee_or_404(employee_id)

    # Grab the most recent flagged prompt for this employee
    prompt_row = fetch_one(
        """
        SELECT p.id, p.prompt_text, p.target_tool, p.risk_level, p.coaching_tip, p.action, p.created_at
        FROM prompts p
        WHERE p.employee_id = ? AND p.risk_level != 'low'
        ORDER BY p.created_at DESC LIMIT 1
        """,
        (employee_id,),
    )

    if prompt_row:
        prompt_row = dict(prompt_row)
        # Get the top detection for this prompt
        detection_row = fetch_one(
            "SELECT type, severity, detail, confidence FROM detections WHERE prompt_id = ? ORDER BY confidence DESC LIMIT 1",
            (prompt_row["id"],),
        )
        detection_type = dict(detection_row)["type"] if detection_row else "policy"
        severity = dict(detection_row)["severity"] if detection_row else prompt_row["risk_level"]
        excerpt = prompt_row["prompt_text"][:200]
        target_tool = prompt_row["target_tool"] or "AI Assistant"
        coaching_tip = prompt_row["coaching_tip"] or COACHING_TIPS.get(detection_type, COACHING_TIPS["policy"])
    else:
        # Fallback demo data when no flagged prompts exist
        detection_type = "pii"
        severity = "medium"
        excerpt = "Can you look up the employee record for John Smith, SSN 123-45-6789?"
        target_tool = "ChatGPT"
        coaching_tip = COACHING_TIPS["pii"]

    ctx = {
        "employee_name": emp["name"],
        "detection_type": detection_type,
        "target_tool": target_tool,
        "severity": severity,
        "prompt_excerpt": excerpt,
        "coaching_tip": coaching_tip,
        "safe_prompt_example": SAFE_EXAMPLES.get(detection_type, SAFE_EXAMPLES["policy"]),
        "policy_url": f"{frontend_base_url().rstrip('/')}/policies",
    }
    html = render_template("coaching.html", ctx)
    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# 2. GET /api/emails/preview/alert?alert_id=1
# ---------------------------------------------------------------------------

@router.get("/preview/alert", response_class=HTMLResponse)
def preview_alert_email(alert_id: int, _current_user: dict = Depends(require_ops_manager)) -> HTMLResponse:
    alert = fetch_one("SELECT id, alert_type, severity, detail, is_active, created_at FROM alerts WHERE id = ?", (alert_id,))
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    alert = dict(alert)

    # Try to find a related prompt/employee via the alert detail or recent high-risk prompt
    recent_prompt = fetch_one(
        """
        SELECT p.id AS prompt_id, p.prompt_text, p.target_tool, p.employee_id, p.action,
               e.name AS employee_name, e.department
        FROM prompts p
        INNER JOIN employees e ON e.id = p.employee_id
        WHERE p.risk_level IN ('high', 'critical')
        ORDER BY p.created_at DESC LIMIT 1
        """
    )

    if recent_prompt:
        recent_prompt = dict(recent_prompt)
        employee_name = recent_prompt["employee_name"]
        department = recent_prompt["department"]
        target_tool = recent_prompt["target_tool"] or "AI Tool"
        action_taken = recent_prompt["action"].replace("_", " ").title() if recent_prompt["action"] else "Flagged"
        prompt_excerpt = recent_prompt["prompt_text"][:300]
        prompt_id = recent_prompt["prompt_id"]
    else:
        employee_name = "Unknown Employee"
        department = "N/A"
        target_tool = "AI Tool"
        action_taken = "Flagged"
        prompt_excerpt = alert["detail"][:300]
        prompt_id = None

    # Build detection rows
    detection_list: list[dict[str, Any]] = []
    if prompt_id:
        det_rows = fetch_rows(
            "SELECT type, severity, detail, confidence FROM detections WHERE prompt_id = ? ORDER BY confidence DESC LIMIT 5",
            (prompt_id,),
        )
        for d in det_rows:
            d = dict(d)
            detection_list.append({
                "type": d["type"],
                "severity": d["severity"],
                "detail": d["detail"],
                "confidence": round(float(d["confidence"]) * 100),
            })

    if not detection_list:
        detection_list.append({
            "type": alert["alert_type"],
            "severity": alert["severity"],
            "detail": alert["detail"][:120],
            "confidence": 95,
        })

    # Map action to badge-friendly label
    action_label_map = {"block": "Blocked", "redact": "Auto-Redacted", "allow": "Allowed", "quarantine": "Quarantined"}
    action_display = action_label_map.get(action_taken.lower(), action_taken)

    ctx = {
        "severity": alert["severity"],
        "employee_name": employee_name,
        "department": department,
        "timestamp": alert["created_at"],
        "target_tool": target_tool,
        "action_taken": action_display,
        "detections": detection_list,
        "prompt_excerpt": prompt_excerpt,
        "prompt_truncated": len(prompt_excerpt) >= 300,
        "dashboard_url": f"{frontend_base_url().rstrip('/')}/alerts/{alert_id}",
    }
    html = render_template("alert.html", ctx)
    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# 3. GET /api/emails/preview/weekly-report
# ---------------------------------------------------------------------------

@router.get("/preview/weekly-report", response_class=HTMLResponse)
def preview_weekly_report(_current_user: dict = Depends(require_ops_manager)) -> HTMLResponse:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=7)).date().isoformat()
    end = now.date().isoformat()

    # Prompts analyzed
    prompt_stats = fetch_one(
        "SELECT COUNT(*) AS total FROM prompts WHERE created_at >= datetime('now', '-7 day')"
    )
    total_prompts = int(prompt_stats["total"] or 0) if prompt_stats else 0

    prev_prompts_row = fetch_one(
        "SELECT COUNT(*) AS total FROM prompts WHERE created_at >= datetime('now', '-14 day') AND created_at < datetime('now', '-7 day')"
    )
    prev_prompts = int(prev_prompts_row["total"] or 0) if prev_prompts_row else 0
    prompts_trend = _trend(total_prompts, prev_prompts)

    # Threats blocked
    threats_row = fetch_one(
        "SELECT COUNT(*) AS total FROM prompts WHERE risk_level IN ('high', 'critical') AND action IN ('block', 'redact') AND created_at >= datetime('now', '-7 day')"
    )
    threats_blocked = int(threats_row["total"] or 0) if threats_row else 0

    prev_threats_row = fetch_one(
        "SELECT COUNT(*) AS total FROM prompts WHERE risk_level IN ('high', 'critical') AND action IN ('block', 'redact') AND created_at >= datetime('now', '-14 day') AND created_at < datetime('now', '-7 day')"
    )
    prev_threats = int(prev_threats_row["total"] or 0) if prev_threats_row else 0
    threats_trend = _trend(threats_blocked, prev_threats)

    # Cost saved estimate ($0.50 per blocked threat is a rough hackathon heuristic)
    cost_saved = round(threats_blocked * 0.50, 2)

    # Shadow AI events
    shadow_row = fetch_one(
        "SELECT COUNT(*) AS total FROM shadow_ai_events WHERE created_at >= datetime('now', '-7 day')"
    )
    shadow_ai_count = int(shadow_row["total"] or 0) if shadow_row else 0

    # Risk breakdown by detection type
    type_counts = fetch_rows(
        """
        SELECT d.type, COUNT(*) AS cnt
        FROM detections d
        INNER JOIN prompts p ON p.id = d.prompt_id
        WHERE p.created_at >= datetime('now', '-7 day')
        GROUP BY d.type
        """
    )
    type_map: dict[str, int] = {}
    for r in type_counts:
        r = dict(r)
        type_map[r["type"]] = int(r["cnt"])

    total_detections = sum(type_map.values()) or 1  # avoid div/0
    pii_count = type_map.get("pii", 0)
    secrets_count = type_map.get("secret", 0)
    policy_count = type_map.get("policy", 0)
    shadow_ai_risk_count = type_map.get("shadow_ai", 0)

    pii_pct = round(pii_count * 100 / total_detections)
    secrets_pct = round(secrets_count * 100 / total_detections)
    policy_pct = round(policy_count * 100 / total_detections)
    shadow_ai_pct = round(shadow_ai_risk_count * 100 / total_detections)

    # Top risk employees
    top_risk_rows = fetch_rows(
        """
        SELECT e.id, e.name, e.department, e.risk_score,
               COUNT(p.id) AS incidents
        FROM employees e
        LEFT JOIN prompts p ON p.employee_id = e.id AND p.risk_level IN ('high', 'critical')
                               AND p.created_at >= datetime('now', '-7 day')
        GROUP BY e.id
        ORDER BY e.risk_score DESC
        LIMIT 5
        """
    )
    top_risk_employees = []
    for r in top_risk_rows:
        r = dict(r)
        top_risk_employees.append({
            "name": r["name"],
            "department": r["department"],
            "risk_score": round(float(r["risk_score"]) * 100),
            "incidents": int(r["incidents"]),
        })

    # Department stats
    dept_rows = fetch_rows(
        """
        SELECT e.department AS name,
               COUNT(p.id) AS total_prompts,
               SUM(CASE WHEN p.risk_level IN ('medium', 'high', 'critical') THEN 1 ELSE 0 END) AS flagged
        FROM employees e
        LEFT JOIN prompts p ON p.employee_id = e.id AND p.created_at >= datetime('now', '-7 day')
        GROUP BY e.department
        ORDER BY total_prompts DESC
        """
    )
    department_stats = []
    for r in dept_rows:
        r = dict(r)
        total = int(r["total_prompts"] or 0)
        flagged = int(r["flagged"] or 0)
        flag_rate = round(flagged * 100 / total, 1) if total > 0 else 0.0
        department_stats.append({
            "name": r["name"],
            "total_prompts": total,
            "flagged": flagged,
            "flag_rate": flag_rate,
        })

    # Compliance — simple heuristic: compliant if threats < 5, warning if < 15, else at_risk
    def _compliance_status(threats: int) -> str:
        if threats <= 2:
            return "compliant"
        if threats <= 10:
            return "warning"
        return "at_risk"

    ctx = {
        "start_date": start,
        "end_date": end,
        "total_prompts": total_prompts,
        "prompts_trend": prompts_trend,
        "threats_blocked": threats_blocked,
        "threats_trend": threats_trend,
        "cost_saved": f"{cost_saved:.2f}",
        "shadow_ai_count": shadow_ai_count,
        "pii_count": pii_count,
        "pii_pct": pii_pct,
        "secrets_count": secrets_count,
        "secrets_pct": secrets_pct,
        "policy_count": policy_count,
        "policy_pct": policy_pct,
        "shadow_ai_risk_count": shadow_ai_risk_count,
        "shadow_ai_pct": shadow_ai_pct,
        "top_risk_employees": top_risk_employees,
        "department_stats": department_stats,
        "soc2_status": _compliance_status(threats_blocked),
        "gdpr_status": _compliance_status(pii_count),
        "ccpa_status": _compliance_status(pii_count),
        "generated_at": now.strftime("%Y-%m-%d %H:%M UTC"),
    }
    html = render_template("weekly_report.html", ctx)
    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# 3b. GET /api/emails/preview/weekly-learning?employee_id=1
# ---------------------------------------------------------------------------

@router.get("/preview/weekly-learning", response_class=HTMLResponse)
def preview_weekly_learning(employee_id: int, _current_user: dict = Depends(require_ops_manager)) -> HTMLResponse:
    from engines.learning_engine import build_learning_email_context

    ctx = build_learning_email_context(employee_id, persist_study_focus=False)
    if not ctx:
        raise HTTPException(
            status_code=404,
            detail=f"No learning data available for employee {employee_id} (no prompts in the last 7 days).",
        )
    html = render_template("learning.html", ctx)
    return HTMLResponse(content=html)


def _trend(current: int, previous: int) -> str:
    if previous == 0:
        if current == 0:
            return "0%"
        return "new"
    diff_pct = round((current - previous) / previous * 100)
    if diff_pct > 0:
        return f"+{diff_pct}%"
    if diff_pct < 0:
        return f"{diff_pct}%"
    return "0%"


# ---------------------------------------------------------------------------
# 4. POST /api/emails/send-coaching?employee_id=1
# ---------------------------------------------------------------------------

@router.post("/send-coaching", response_class=HTMLResponse)
def send_coaching_email(employee_id: int, _current_user: dict = Depends(require_ops_manager)) -> HTMLResponse:
    # Render the same coaching email
    emp = _get_employee_or_404(employee_id)

    prompt_row = fetch_one(
        """
        SELECT p.id, p.prompt_text, p.target_tool, p.risk_level, p.coaching_tip, p.action, p.created_at
        FROM prompts p
        WHERE p.employee_id = ? AND p.risk_level != 'low'
        ORDER BY p.created_at DESC LIMIT 1
        """,
        (employee_id,),
    )

    if prompt_row:
        prompt_row = dict(prompt_row)
        detection_row = fetch_one(
            "SELECT type, severity, detail, confidence FROM detections WHERE prompt_id = ? ORDER BY confidence DESC LIMIT 1",
            (prompt_row["id"],),
        )
        detection_type = dict(detection_row)["type"] if detection_row else "policy"
        severity = dict(detection_row)["severity"] if detection_row else prompt_row["risk_level"]
        excerpt = prompt_row["prompt_text"][:200]
        target_tool = prompt_row["target_tool"] or "AI Assistant"
        coaching_tip = prompt_row["coaching_tip"] or COACHING_TIPS.get(detection_type, COACHING_TIPS["policy"])
    else:
        detection_type = "pii"
        severity = "medium"
        excerpt = "Can you look up the employee record for John Smith, SSN 123-45-6789?"
        target_tool = "ChatGPT"
        coaching_tip = COACHING_TIPS["pii"]

    ctx = {
        "employee_name": emp["name"],
        "detection_type": detection_type,
        "target_tool": target_tool,
        "severity": severity,
        "prompt_excerpt": excerpt,
        "coaching_tip": coaching_tip,
        "safe_prompt_example": SAFE_EXAMPLES.get(detection_type, SAFE_EXAMPLES["policy"]),
        "policy_url": f"{frontend_base_url().rstrip('/')}/policies",
    }
    html = render_template("coaching.html", ctx)

    # Log to system_messages as a simulated send
    execute(
        """
        INSERT INTO system_messages (recipient_type, recipient_id, message_type, subject, body, related_entity, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "employee",
            employee_id,
            "coaching_email",
            f"Security Coaching for {emp['name']}",
            f"Coaching email sent regarding {detection_type} detection ({severity} severity).",
            "coaching_email",
            _utc_now(),
        ),
    )

    return HTMLResponse(content=html)
