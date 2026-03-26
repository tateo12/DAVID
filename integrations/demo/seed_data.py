#!/usr/bin/env python3
"""Seed the Sentinel SQLite database with realistic demo data."""

from __future__ import annotations

import argparse
import json
import os
import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from faker import Faker

fake = Faker()
Faker.seed(42)
random.seed(42)

SCRIPT_DIR = Path(__file__).resolve().parent

DEPARTMENTS = ["engineering", "sales", "marketing", "hr", "finance", "executive"]

DEPARTMENT_ROLES = {
    "engineering": ["Software Engineer", "Senior Engineer", "DevOps Engineer"],
    "sales": ["Account Executive", "Sales Manager", "SDR"],
    "marketing": ["Content Strategist", "Marketing Manager", "Growth Lead"],
    "hr": ["HR Generalist", "Recruiter", "HR Manager"],
    "finance": ["Financial Analyst", "Controller", "Accountant"],
    "executive": ["VP of Product", "Chief of Staff", "Director of Strategy"],
}

SHADOW_AI_TOOLS = [
    ("Gemini", "gemini.google.com"),
    ("Perplexity", "perplexity.ai"),
    ("Otter.ai", "otter.ai"),
    ("Codeium", "codeium.com"),
    ("Jasper", "jasper.ai"),
    ("Bard", "bard.google.com"),
    ("Copy.ai", "copy.ai"),
    ("Poe", "poe.com"),
    ("You.com", "you.com"),
    ("DeepSeek", "chat.deepseek.com"),
]

SEVERITY_MAP = {
    "low": "low",
    "medium": "medium",
    "high": "high",
    "critical": "critical",
}

ACTION_MAP = {
    "low": "allowed",
    "medium": "warned",
    "high": "blocked",
    "critical": "blocked",
}

COACHING_TIPS = {
    "pii_ssn": "Never share Social Security Numbers with AI tools. Use masked values (***-**-1234) instead.",
    "pii_credit_card": "Credit card numbers must never be pasted into AI tools. Use tokenized references.",
    "pii_name": "Avoid sharing real customer or employee names. Use pseudonyms or role titles.",
    "pii_email": "Strip email addresses before sharing data with AI. Use placeholders like user@example.com.",
    "pii_phone": "Phone numbers are PII. Remove them or replace with 555-XXX-XXXX placeholders.",
    "pii_address": "Physical addresses are PII. Generalize to city/state level if location context is needed.",
    "pii_dob": "Dates of birth are sensitive PII. Remove them entirely from AI prompts.",
    "pii_partial_ssn": "Even partial SSNs can be sensitive. Avoid sharing any portion of an SSN.",
    "secret_api_key": "API keys should never appear in AI prompts. Rotate this key immediately and use env variables.",
    "secret_aws_key": "AWS credentials in an AI prompt is a critical incident. Rotate keys via IAM console NOW.",
    "secret_aws_secret": "AWS secret keys must be rotated immediately after exposure to any AI tool.",
    "secret_connection_string": "Database connection strings contain credentials. Use config references, not raw strings.",
    "secret_password": "Passwords must never be shared with AI tools. Rotate any exposed passwords immediately.",
    "secret_github_token": "GitHub tokens grant repo access. Revoke this token and generate a new one.",
    "secret_token": "Tokens and secrets should be referenced by name, not by value.",
    "secret_jwt": "JWT secrets allow token forgery. Rotate the secret in your auth configuration.",
    "secret_ssh_key": "SSH credentials should never be shared. Regenerate keys if exposed.",
    "secret_webhook_secret": "Webhook secrets should be rotated after any exposure.",
    "secret_cvv": "CVV codes are highly sensitive payment data. Never share them with AI tools.",
    "secret_account_number": "Bank account and routing numbers are sensitive financial data. Never share with AI.",
    "secret_api_key_possible": "This looks like it might be an API key. Use clearly fake examples (e.g., sk-EXAMPLE-xxx).",
    "secret_password_possible": "Possible password detected. Avoid typing real passwords into AI prompts.",
    "policy_confidential_project": "Project codenames are confidential. Use generic descriptions instead.",
    "policy_internal_url": "Internal URLs reveal infrastructure details. Never share them with external AI.",
    "policy_internal_ip": "Internal IP addresses expose network topology. Redact before sharing.",
    "policy_deal_size": "Deal sizes are confidential sales data. Use ranges or anonymized references.",
    "policy_competitive_analysis": "Competitive intelligence should not be shared with external AI tools.",
    "policy_internal_pricing": "Internal pricing is confidential. Use hypothetical numbers for AI assistance.",
    "policy_ma_data": "M&A information is highly confidential and potentially material non-public info (MNPI).",
    "policy_revenue_figures": "Revenue figures are confidential financial data. Do not share with AI tools.",
    "policy_financial_data": "Financial data should be anonymized before using AI for analysis.",
    "policy_performance_review": "Performance review data is confidential HR information.",
    "policy_salary": "Salary data is strictly confidential. Never share with external tools.",
    "policy_audit_findings": "Audit findings are highly sensitive. Do not share with AI tools.",
    "policy_board_minutes": "Board meeting contents are strictly confidential and may contain MNPI.",
    "policy_strategic_plans": "Strategic plans are confidential. Use high-level descriptions only.",
    "policy_customer_data": "Customer data must not be shared with external AI tools.",
    "policy_pipeline_data": "Sales pipeline data is confidential. Anonymize before using AI.",
    "policy_unreleased_product": "Unreleased product info is confidential. Do not share with AI tools.",
    "policy_proprietary_code": "Proprietary source code should not be pasted into external AI tools.",
    "policy_vendor_contract": "Vendor contract terms are confidential business information.",
    "policy_employee_data": "Employee data is protected. Do not share with unauthorized AI tools.",
    "policy_internal_metrics": "Internal metrics should be anonymized before sharing with AI.",
    "shadow_ai_unauthorized_tool": "This AI tool is not approved for company use. Stick to approved tools only.",
}

POLICY_DEFINITIONS = {
    "engineering": {
        "name": "Engineering AI Usage Policy",
        "description": "Controls AI usage for engineering staff including code review, debugging, and documentation.",
        "rules_json": json.dumps({
            "approved_tools": ["Claude", "GitHub Copilot"],
            "blocked_patterns": ["credentials", "api_keys", "connection_strings", "internal_endpoints"],
            "allow_code": True,
            "allow_customer_data": False,
            "max_risk_tolerance": "medium",
            "require_review_above": "high",
        }),
    },
    "sales": {
        "name": "Sales AI Usage Policy",
        "description": "Controls AI usage for sales staff including communications, analysis, and CRM tasks.",
        "rules_json": json.dumps({
            "approved_tools": ["ChatGPT", "Claude"],
            "blocked_patterns": ["customer_names", "deal_sizes", "pipeline_data", "competitive_analysis"],
            "allow_code": False,
            "allow_customer_data": False,
            "max_risk_tolerance": "low",
            "require_review_above": "medium",
        }),
    },
    "marketing": {
        "name": "Marketing AI Usage Policy",
        "description": "Controls AI usage for marketing staff including content creation, campaigns, and social media.",
        "rules_json": json.dumps({
            "approved_tools": ["ChatGPT", "Claude", "Midjourney"],
            "blocked_patterns": ["revenue_figures", "unreleased_products", "internal_metrics"],
            "allow_code": False,
            "allow_customer_data": False,
            "max_risk_tolerance": "low",
            "require_review_above": "medium",
        }),
    },
    "hr": {
        "name": "HR AI Usage Policy",
        "description": "Controls AI usage for HR staff including recruitment, employee relations, and benefits.",
        "rules_json": json.dumps({
            "approved_tools": ["Claude"],
            "blocked_patterns": ["employee_data", "salary", "performance_reviews", "interview_notes", "ssn"],
            "allow_code": False,
            "allow_customer_data": False,
            "max_risk_tolerance": "low",
            "require_review_above": "low",
        }),
    },
    "finance": {
        "name": "Finance AI Usage Policy",
        "description": "Controls AI usage for finance staff including reporting, analysis, and compliance.",
        "rules_json": json.dumps({
            "approved_tools": ["Claude"],
            "blocked_patterns": ["financial_data", "revenue", "projections", "audit_findings", "account_numbers"],
            "allow_code": False,
            "allow_customer_data": False,
            "max_risk_tolerance": "low",
            "require_review_above": "low",
        }),
    },
    "executive": {
        "name": "Executive AI Usage Policy",
        "description": "Controls AI usage for executive staff. Strictest controls due to access to strategic data.",
        "rules_json": json.dumps({
            "approved_tools": ["Claude"],
            "blocked_patterns": ["ma_data", "board_minutes", "strategic_plans", "all_pii", "all_secrets"],
            "allow_code": False,
            "allow_customer_data": False,
            "max_risk_tolerance": "low",
            "require_review_above": "low",
        }),
    },
}


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    department TEXT,
    role TEXT,
    risk_score REAL DEFAULT 0,
    total_prompts INTEGER DEFAULT 0,
    flagged_prompts INTEGER DEFAULT 0,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER,
    text TEXT,
    target_tool TEXT,
    risk_level TEXT,
    action TEXT,
    detections_json TEXT,
    coaching_tip TEXT,
    redacted_text TEXT,
    created_at TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS detections (
    id INTEGER PRIMARY KEY,
    prompt_id INTEGER,
    type TEXT,
    subtype TEXT,
    severity TEXT,
    detail TEXT,
    confidence REAL,
    layer TEXT,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);

CREATE TABLE IF NOT EXISTS shadow_ai_events (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER,
    tool_name TEXT,
    domain TEXT,
    detected_at TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY,
    type TEXT,
    severity TEXT,
    message TEXT,
    employee_id INTEGER,
    resolved INTEGER DEFAULT 0,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY,
    name TEXT,
    description TEXT,
    department TEXT,
    rules_json TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);
"""


def create_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(CREATE_TABLES_SQL)


# ---------------------------------------------------------------------------
# Seeding functions
# ---------------------------------------------------------------------------

def random_timestamp(days_back: int = 30) -> str:
    """Return an ISO timestamp randomly within the last *days_back* days."""
    delta = timedelta(
        days=random.randint(0, days_back),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59),
    )
    return (datetime.utcnow() - delta).isoformat()


def seed_employees(conn: sqlite3.Connection) -> list[dict]:
    """Create 18 employees, 3 per department. Returns list of dicts."""
    employees: list[dict] = []
    emp_id = 1
    for dept in DEPARTMENTS:
        roles = DEPARTMENT_ROLES[dept]
        for i in range(3):
            name = fake.name()
            email = f"{name.split()[0].lower()}.{name.split()[-1].lower()}@acmecorp.com"
            created = random_timestamp(days_back=90)
            emp = {
                "id": emp_id,
                "name": name,
                "email": email,
                "department": dept,
                "role": roles[i],
                "risk_score": 0.0,
                "total_prompts": 0,
                "flagged_prompts": 0,
                "created_at": created,
            }
            employees.append(emp)
            conn.execute(
                "INSERT INTO employees (id, name, email, department, role, risk_score, total_prompts, flagged_prompts, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (emp["id"], emp["name"], emp["email"], emp["department"],
                 emp["role"], emp["risk_score"], emp["total_prompts"],
                 emp["flagged_prompts"], emp["created_at"]),
            )
            emp_id += 1
    conn.commit()
    return employees


def detection_type_category(det_name: str) -> str:
    """Map a detection name like 'pii_ssn' to its type category."""
    if det_name.startswith("pii"):
        return "pii"
    elif det_name.startswith("secret"):
        return "secret"
    elif det_name.startswith("policy"):
        return "policy"
    elif det_name.startswith("shadow_ai"):
        return "shadow_ai"
    return "unknown"


def detection_layer(det_name: str) -> str:
    """Determine which detection layer would catch this."""
    # Most PII and secrets are caught by regex (L1)
    if det_name.startswith("pii") or det_name.startswith("secret"):
        if "possible" in det_name or "partial" in det_name:
            return "L2"  # Haiku for uncertain matches
        return "L1"  # Regex
    # Policy violations typically need LLM judgment
    if det_name.startswith("policy"):
        return "L2"  # Haiku classification
    if det_name.startswith("shadow_ai"):
        return "L1"  # Domain list check
    return "L3"  # Sonnet fallback


def seed_prompts_and_detections(
    conn: sqlite3.Connection,
    employees: list[dict],
    sample_prompts: list[dict],
    target_count: int = 220,
) -> tuple[int, int]:
    """Seed historical prompts and their detections. Returns (prompt_count, detection_count)."""

    # Map employee IDs from sample_prompts to our generated employees.
    # Sample prompts use employee_id 1-20; we have 1-18.
    # We remap by department: pick a random employee in the matching department.
    dept_employee_map: dict[str, list[int]] = {}
    for emp in employees:
        dept_employee_map.setdefault(emp["department"], []).append(emp["id"])

    prompt_count = 0
    detection_count = 0

    # We will cycle through sample prompts, adding timestamp variation.
    # First pass: use all originals. Subsequent passes: reuse with new timestamps.
    prompts_to_insert = []
    while len(prompts_to_insert) < target_count:
        for sp in sample_prompts:
            if len(prompts_to_insert) >= target_count:
                break

            dept = sp.get("department", "engineering")
            candidates = dept_employee_map.get(dept, dept_employee_map["engineering"])
            emp_id = random.choice(candidates)

            risk_level = sp.get("expected_risk", "low")
            action = ACTION_MAP.get(risk_level, "allowed")
            expected_dets = sp.get("expected_detections", [])

            # Build coaching tip from first detection
            coaching = ""
            if expected_dets:
                coaching = COACHING_TIPS.get(expected_dets[0], "Review your prompt for sensitive content.")

            # Build detections_json
            det_list = []
            for det_name in expected_dets:
                det_list.append({
                    "type": detection_type_category(det_name),
                    "subtype": det_name,
                    "severity": SEVERITY_MAP.get(risk_level, "low"),
                    "confidence": round(random.uniform(0.75, 0.99), 2),
                    "layer": detection_layer(det_name),
                })

            created_at = random_timestamp(days_back=30)

            prompts_to_insert.append({
                "employee_id": emp_id,
                "text": sp["text"],
                "target_tool": sp.get("target_tool", "Claude"),
                "risk_level": risk_level,
                "action": action,
                "detections_json": json.dumps(det_list) if det_list else "[]",
                "coaching_tip": coaching,
                "redacted_text": None,
                "created_at": created_at,
                "detections": det_list,
            })

    # Insert prompts and detections
    for p in prompts_to_insert:
        cursor = conn.execute(
            "INSERT INTO prompts (employee_id, text, target_tool, risk_level, action, detections_json, coaching_tip, redacted_text, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (p["employee_id"], p["text"], p["target_tool"], p["risk_level"],
             p["action"], p["detections_json"], p["coaching_tip"],
             p["redacted_text"], p["created_at"]),
        )
        prompt_id = cursor.lastrowid
        prompt_count += 1

        for det in p["detections"]:
            conn.execute(
                "INSERT INTO detections (prompt_id, type, subtype, severity, detail, confidence, layer) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (prompt_id, det["type"], det["subtype"], det["severity"],
                 f"Detected {det['subtype']} in prompt text",
                 det["confidence"], det["layer"]),
            )
            detection_count += 1

    conn.commit()
    return prompt_count, detection_count


def seed_shadow_ai_events(
    conn: sqlite3.Connection,
    employees: list[dict],
    sample_prompts: list[dict],
) -> int:
    """Create shadow AI events for employees who used unauthorized tools."""
    count = 0
    shadow_prompts = [sp for sp in sample_prompts if sp.get("category") == "shadow_ai"]

    # Map departments to employee ids
    dept_employee_map: dict[str, list[int]] = {}
    for emp in employees:
        dept_employee_map.setdefault(emp["department"], []).append(emp["id"])

    for sp in shadow_prompts:
        dept = sp.get("department", "engineering")
        candidates = dept_employee_map.get(dept, dept_employee_map["engineering"])
        emp_id = random.choice(candidates)
        tool_name = sp.get("target_tool", "Unknown")

        # Find matching domain from our tools list, fall back to generic
        domain = f"{tool_name.lower().replace(' ', '').replace('.', '')}.com"
        for name, dom in SHADOW_AI_TOOLS:
            if name.lower() == tool_name.lower():
                domain = dom
                break

        detected_at = random_timestamp(days_back=30)

        conn.execute(
            "INSERT INTO shadow_ai_events (employee_id, tool_name, domain, detected_at) "
            "VALUES (?, ?, ?, ?)",
            (emp_id, tool_name, domain, detected_at),
        )
        count += 1

    # Add a few extra random shadow AI events for variety
    for _ in range(8):
        emp = random.choice(employees)
        tool_name, domain = random.choice(SHADOW_AI_TOOLS)
        detected_at = random_timestamp(days_back=30)
        conn.execute(
            "INSERT INTO shadow_ai_events (employee_id, tool_name, domain, detected_at) "
            "VALUES (?, ?, ?, ?)",
            (emp["id"], tool_name, domain, detected_at),
        )
        count += 1

    conn.commit()
    return count


def update_employee_risk_scores(conn: sqlite3.Connection, employees: list[dict]) -> None:
    """Compute and update risk_score based on flagged/total prompts ratio."""
    for emp in employees:
        eid = emp["id"]
        row = conn.execute(
            "SELECT COUNT(*) FROM prompts WHERE employee_id = ?", (eid,)
        ).fetchone()
        total = row[0] if row else 0

        row = conn.execute(
            "SELECT COUNT(*) FROM prompts WHERE employee_id = ? AND risk_level IN ('high', 'critical')",
            (eid,),
        ).fetchone()
        flagged = row[0] if row else 0

        risk_score = round((flagged / total) * 100, 1) if total > 0 else 0.0

        conn.execute(
            "UPDATE employees SET total_prompts = ?, flagged_prompts = ?, risk_score = ? WHERE id = ?",
            (total, flagged, risk_score, eid),
        )
    conn.commit()


def seed_policies(conn: sqlite3.Connection) -> int:
    """Seed one policy per department. Returns count."""
    now = datetime.utcnow().isoformat()
    count = 0
    for dept, policy in POLICY_DEFINITIONS.items():
        conn.execute(
            "INSERT INTO policies (name, description, department, rules_json, enabled, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (policy["name"], policy["description"], dept, policy["rules_json"], 1, now, now),
        )
        count += 1
    conn.commit()
    return count


def seed_alerts(conn: sqlite3.Connection, employees: list[dict]) -> int:
    """Create sample alerts of varying severity. Returns count."""
    alert_templates = [
        {
            "type": "pii_exposure",
            "severity": "critical",
            "message": "Employee shared SSN and credit card data with ChatGPT",
        },
        {
            "type": "secret_exposure",
            "severity": "critical",
            "message": "AWS credentials pasted into AI prompt — immediate key rotation required",
        },
        {
            "type": "policy_violation",
            "severity": "high",
            "message": "Confidential M&A information shared with external AI tool",
        },
        {
            "type": "shadow_ai",
            "severity": "high",
            "message": "Employee using unauthorized AI tool (Otter.ai) with company data",
        },
        {
            "type": "pii_exposure",
            "severity": "high",
            "message": "Multiple customer PII fields (name, phone, email) sent to AI",
        },
        {
            "type": "policy_violation",
            "severity": "medium",
            "message": "Internal company metrics shared with AI tool",
        },
        {
            "type": "shadow_ai",
            "severity": "medium",
            "message": "Unauthorized AI tool access detected from marketing department",
        },
        {
            "type": "secret_exposure",
            "severity": "critical",
            "message": "Production database connection string exposed in AI prompt",
        },
        {
            "type": "policy_violation",
            "severity": "critical",
            "message": "Board meeting minutes and IPO plans shared with external AI",
        },
        {
            "type": "pii_exposure",
            "severity": "high",
            "message": "Payroll data including SSN and bank account numbers sent to AI tool",
        },
    ]

    count = 0
    for alert in alert_templates:
        emp = random.choice(employees)
        resolved = random.choice([0, 0, 0, 1])  # 25% resolved
        created_at = random_timestamp(days_back=14)
        conn.execute(
            "INSERT INTO alerts (type, severity, message, employee_id, resolved, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (alert["type"], alert["severity"], alert["message"], emp["id"], resolved, created_at),
        )
        count += 1
    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Sentinel demo database")
    parser.add_argument(
        "--db",
        default=str(SCRIPT_DIR / ".." / ".." / "backend" / "sentinel.db"),
        help="Path to the SQLite database file (default: ../../backend/sentinel.db relative to script)",
    )
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Load sample prompts
    prompts_file = SCRIPT_DIR / "sample_prompts.json"
    if not prompts_file.exists():
        print(f"ERROR: sample_prompts.json not found at {prompts_file}")
        return

    with open(prompts_file) as f:
        sample_data = json.load(f)
    sample_prompts = sample_data["prompts"]

    print(f"Seeding database at: {db_path}")
    print(f"Loaded {len(sample_prompts)} sample prompt templates\n")

    conn = sqlite3.connect(str(db_path))
    try:
        # Create tables
        create_tables(conn)
        print("[1/6] Tables created")

        # Seed employees
        employees = seed_employees(conn)
        print(f"[2/6] Seeded {len(employees)} employees across {len(DEPARTMENTS)} departments")

        # Seed prompts and detections
        prompt_count, detection_count = seed_prompts_and_detections(
            conn, employees, sample_prompts, target_count=220,
        )
        print(f"[3/6] Seeded {prompt_count} prompts with {detection_count} detections")

        # Seed shadow AI events
        shadow_count = seed_shadow_ai_events(conn, employees, sample_prompts)
        print(f"[4/6] Seeded {shadow_count} shadow AI events")

        # Update risk scores
        update_employee_risk_scores(conn, employees)
        print("[5/6] Computed employee risk scores")

        # Seed policies
        policy_count = seed_policies(conn)
        print(f"[6/6] Seeded {policy_count} policies")

        # Seed alerts
        alert_count = seed_alerts(conn, employees)
        print(f"[+]   Seeded {alert_count} alerts")

        # Print summary
        print("\n" + "=" * 50)
        print("SEED SUMMARY")
        print("=" * 50)
        print(f"  Database:         {db_path}")
        print(f"  Employees:        {len(employees)}")
        print(f"  Prompts:          {prompt_count}")
        print(f"  Detections:       {detection_count}")
        print(f"  Shadow AI events: {shadow_count}")
        print(f"  Policies:         {policy_count}")
        print(f"  Alerts:           {alert_count}")
        print()

        # Show per-department breakdown
        print("Per-department breakdown:")
        for dept in DEPARTMENTS:
            dept_emps = [e for e in employees if e["department"] == dept]
            emp_ids = tuple(e["id"] for e in dept_emps)
            placeholders = ",".join("?" * len(emp_ids))
            row = conn.execute(
                f"SELECT COUNT(*) FROM prompts WHERE employee_id IN ({placeholders})",
                emp_ids,
            ).fetchone()
            dept_prompts = row[0] if row else 0

            row = conn.execute(
                f"SELECT COUNT(*) FROM prompts WHERE employee_id IN ({placeholders}) AND risk_level IN ('high', 'critical')",
                emp_ids,
            ).fetchone()
            dept_flagged = row[0] if row else 0

            avg_risk = sum(
                conn.execute("SELECT risk_score FROM employees WHERE id = ?", (e["id"],)).fetchone()[0]
                for e in dept_emps
            ) / len(dept_emps)

            print(f"  {dept:<12} | {len(dept_emps)} employees | {dept_prompts:>3} prompts | {dept_flagged:>3} flagged | avg risk {avg_risk:.1f}%")

        print("\nDone! Database is ready for demo.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
