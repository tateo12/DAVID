"""Real SMTP email sender for Sentinel.

Falls back to inserting into the system_messages table when SMTP is not
configured, preserving the existing demo/preview behavior.
"""

import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from config import frontend_base_url, get_settings
from database import execute, fetch_one

log = logging.getLogger(__name__)


class EmailSender:
    """Sends real emails via SMTP when configured, otherwise queues to DB."""

    def _smtp_configured(self) -> bool:
        s = get_settings()
        return bool(s.smtp_host and s.smtp_user and s.smtp_password)

    def _send_smtp(self, to: str, subject: str, html_body: str) -> None:
        s = get_settings()
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = s.smtp_from_address
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))

        if s.smtp_use_tls:
            with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
                server.starttls()
                server.login(s.smtp_user, s.smtp_password)
                server.sendmail(s.smtp_from_address, [to], msg.as_string())
        else:
            with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
                server.login(s.smtp_user, s.smtp_password)
                server.sendmail(s.smtp_from_address, [to], msg.as_string())

    def _queue_to_db(
        self,
        recipient_type: str,
        recipient_id: int | None,
        message_type: str,
        subject: str,
        body: str,
        related_entity: str | None = None,
    ) -> None:
        execute(
            """
            INSERT INTO system_messages
                (recipient_type, recipient_id, message_type, subject, body, related_entity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recipient_type,
                recipient_id,
                message_type,
                subject,
                body,
                related_entity,
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    def _render_template(self, name: str, ctx: dict[str, Any]) -> str:
        from routes.emails import render_template
        return render_template(name, ctx)

    def _employee_email(self, employee_id: int) -> str | None:
        """Look up employee name for email address derivation.
        Real deployments would store actual email; here we derive from user table."""
        row = fetch_one(
            "SELECT u.username FROM users u WHERE u.employee_id = ?",
            (employee_id,),
        )
        if row:
            return f"{row['username']}@company.com"
        return None

    def _employee_info(self, employee_id: int) -> dict[str, Any]:
        row = fetch_one(
            "SELECT id, name, department, role FROM employees WHERE id = ?",
            (employee_id,),
        )
        if row:
            return dict(row)
        return {"id": employee_id, "name": "Unknown", "department": "N/A", "role": "employee"}

    # -- Public API ------------------------------------------------------------

    def send_security_alert(
        self,
        employee_id: int,
        prompt_id: int,
        risk_level: Any,
        action: Any,
        detections: list[Any],
    ) -> None:
        """Send a security alert email when a prompt is blocked or quarantined."""
        emp = self._employee_info(employee_id)
        severity = risk_level.value if hasattr(risk_level, "value") else str(risk_level)
        action_val = action.value if hasattr(action, "value") else str(action)

        action_label_map = {
            "block": "Blocked",
            "redact": "Auto-Redacted",
            "allow": "Allowed",
            "quarantine": "Quarantined",
        }
        action_display = action_label_map.get(action_val, action_val.title())

        prompt_row = fetch_one(
            "SELECT prompt_text, target_tool, created_at FROM prompts WHERE id = ?",
            (prompt_id,),
        )
        prompt_text = prompt_row["prompt_text"][:300] if prompt_row else ""
        target_tool = (prompt_row["target_tool"] if prompt_row else "AI Tool") or "AI Tool"
        timestamp = prompt_row["created_at"] if prompt_row else datetime.now(timezone.utc).isoformat()

        detection_list = []
        for d in detections[:5]:
            det_type = d.type.value if hasattr(d.type, "value") else str(d.type)
            det_sev = d.severity.value if hasattr(d.severity, "value") else str(d.severity)
            detection_list.append({
                "type": det_type,
                "severity": det_sev,
                "detail": str(d.detail)[:120],
                "confidence": round(float(d.confidence) * 100),
            })

        if not detection_list:
            detection_list.append({
                "type": "security",
                "severity": severity,
                "detail": f"Prompt {prompt_id} triggered {action_display}",
                "confidence": 95,
            })

        ctx = {
            "severity": severity,
            "employee_name": emp["name"],
            "department": emp["department"],
            "timestamp": timestamp,
            "target_tool": target_tool,
            "action_taken": action_display,
            "detections": detection_list,
            "prompt_excerpt": prompt_text,
            "prompt_truncated": len(prompt_text) >= 300,
            "dashboard_url": f"{frontend_base_url().rstrip('/')}/prompts/{prompt_id}",
        }

        subject = f"Sentinel Security Alert: {severity.upper()} - {action_display}"

        try:
            html = self._render_template("alert.html", ctx)
        except Exception as exc:
            log.warning("Failed to render alert template: %s", exc)
            html = f"<p>Security alert: {severity} severity, action {action_display} on prompt {prompt_id}</p>"

        if self._smtp_configured():
            settings = get_settings()
            recipients = []

            emp_email = self._employee_email(employee_id)
            if emp_email:
                recipients.append(emp_email)

            if settings.alert_email:
                recipients.extend(
                    addr.strip() for addr in settings.alert_email.split(",") if addr.strip()
                )

            for addr in recipients:
                try:
                    self._send_smtp(addr, subject, html)
                    log.info("Security alert sent to %s for prompt %d", addr, prompt_id)
                except Exception as exc:
                    log.error("SMTP send failed for %s: %s", addr, exc)

        self._queue_to_db(
            recipient_type="employee",
            recipient_id=employee_id,
            message_type="security_alert",
            subject=subject,
            body=f"Security alert ({severity}): prompt {prompt_id} was {action_display}.",
            related_entity=f"prompt:{prompt_id}",
        )
        self._queue_to_db(
            recipient_type="manager",
            recipient_id=None,
            message_type="security_alert",
            subject=subject,
            body=f"Security alert ({severity}): {emp['name']} prompt {prompt_id} was {action_display}.",
            related_entity=f"prompt:{prompt_id}",
        )

    def send_coaching_email(self, employee_id: int) -> None:
        """Send a coaching email to an employee about their most recent flagged prompt."""
        from routes.emails import COACHING_TIPS, SAFE_EXAMPLES

        emp = self._employee_info(employee_id)

        prompt_row = fetch_one(
            """
            SELECT p.id, p.prompt_text, p.target_tool, p.risk_level, p.coaching_tip
            FROM prompts p
            WHERE p.employee_id = ? AND p.risk_level != 'low'
            ORDER BY p.created_at DESC LIMIT 1
            """,
            (employee_id,),
        )

        if prompt_row:
            prompt_row = dict(prompt_row)
            det_row = fetch_one(
                "SELECT type, severity FROM detections WHERE prompt_id = ? ORDER BY confidence DESC LIMIT 1",
                (prompt_row["id"],),
            )
            detection_type = dict(det_row)["type"] if det_row else "policy"
            severity = dict(det_row)["severity"] if det_row else prompt_row["risk_level"]
            excerpt = prompt_row["prompt_text"][:200]
            target_tool = prompt_row["target_tool"] or "AI Assistant"
            coaching_tip = prompt_row["coaching_tip"] or COACHING_TIPS.get(detection_type, COACHING_TIPS["policy"])
        else:
            return  # no flagged prompts to coach on

        ctx = {
            "employee_name": emp["name"],
            "detection_type": detection_type,
            "target_tool": target_tool,
            "severity": severity,
            "prompt_excerpt": excerpt,
            "coaching_tip": coaching_tip,
            "safe_prompt_example": SAFE_EXAMPLES.get(detection_type, SAFE_EXAMPLES["policy"]),
            "policy_url": "http://localhost:3000/policies",
        }

        subject = f"Sentinel: AI Security Coaching for {emp['name']}"
        try:
            html = self._render_template("coaching.html", ctx)
        except Exception as exc:
            log.warning("Failed to render coaching template: %s", exc)
            html = f"<p>Coaching: {coaching_tip}</p>"

        if self._smtp_configured():
            emp_email = self._employee_email(employee_id)
            if emp_email:
                try:
                    self._send_smtp(emp_email, subject, html)
                except Exception as exc:
                    log.error("SMTP coaching send failed: %s", exc)

        self._queue_to_db(
            recipient_type="employee",
            recipient_id=employee_id,
            message_type="coaching_email",
            subject=subject,
            body=f"Coaching email sent regarding {detection_type} detection ({severity} severity).",
            related_entity="coaching_email",
        )

    def send_weekly_learning(
        self,
        employee_id: int,
        html_body: str,
        subject: str | None = None,
    ) -> None:
        """Send a weekly personalized learning email."""
        emp = self._employee_info(employee_id)
        subject = subject or f"Sentinel: Your Weekly AI Skills Report - {emp['name']}"

        if self._smtp_configured():
            emp_email = self._employee_email(employee_id)
            if emp_email:
                try:
                    self._send_smtp(emp_email, subject, html_body)
                except Exception as exc:
                    log.error("SMTP weekly learning send failed: %s", exc)

        self._queue_to_db(
            recipient_type="employee",
            recipient_id=employee_id,
            message_type="weekly_learning",
            subject=subject,
            body=f"Weekly learning email sent to {emp['name']}.",
            related_entity="weekly_learning",
        )


def send_employee_invite_email(to_email: str, invite_url: str, employee_name: str, *, reminder: bool = False) -> None:
    sender = EmailSender()
    subject = (
        "Reminder: finish your Sentinel activation"
        if reminder
        else "You're invited to Sentinel — activate your account"
    )
    html = f"""<p>Hi {employee_name or "there"},</p>
<p>{"This is a reminder to complete your Sentinel setup." if reminder else "Your organization added you to Sentinel for safer AI use."}</p>
<p><a href="{invite_url}">Create your account</a></p>
<p>Then install the Sentinel browser extension and sign in with the same username and password so monitoring can begin.</p>"""
    if sender._smtp_configured():
        try:
            sender._send_smtp(to_email, subject, html)
        except Exception as exc:
            log.error("employee invite email failed: %s", exc)
    sender._queue_to_db(
        recipient_type="employee",
        recipient_id=None,
        message_type="employee_invite_reminder" if reminder else "employee_invite",
        subject=subject,
        body=f"invite link: {invite_url}",
        related_entity="employee_invite",
    )


def process_pending_employee_invite_reminders() -> int:
    """Send one reminder per pending invite ~2+ days after the original invite."""
    from datetime import datetime, timedelta, timezone

    from config import frontend_base_url
    from database import _utc_now, execute, fetch_rows

    cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    rows = fetch_rows(
        """
        SELECT id, name, email, invite_token FROM employees
        WHERE invite_token IS NOT NULL
          AND COALESCE(email, '') != ''
          AND account_claimed_at IS NULL
          AND invite_reminder_sent_at IS NULL
          AND invite_sent_at IS NOT NULL
          AND invite_sent_at < ?
        """,
        (cutoff,),
    )
    base = frontend_base_url().rstrip("/")
    sent = 0
    for r in rows:
        token = r["invite_token"]
        em = (r["email"] or "").strip()
        if not token or not em:
            continue
        url = f"{base}/register-invite?token={token}"
        send_employee_invite_email(em, url, str(r["name"] or "there"), reminder=True)
        execute(
            "UPDATE employees SET invite_reminder_sent_at = ? WHERE id = ?",
            (_utc_now(), r["id"]),
        )
        sent += 1
    return sent

def send_otp_email(to_email: str, code: str, role: str) -> None:
    sender = EmailSender()
    subject = "Sentinel Verification Code"
    html = f"""<p>Your Sentinel verification code is:</p>
<h2>{code}</h2>
<p>Enter this code to register your {role} account.</p>"""
    if sender._smtp_configured():
        try:
            sender._send_smtp(to_email, subject, html)
        except Exception as exc:
            log.error("otp email failed: %s", exc)
    sender._queue_to_db(
        recipient_type="employee",
        recipient_id=None,
        message_type="otp_code",
        subject=subject,
        body=f"code: {code}",
        related_entity="otp",
    )
