#!/usr/bin/env python3
"""
Sentinel Weekly Security Report — PDF Generator

Generates a branded PDF report with KPI summaries, charts, tables,
and compliance status from either a JSON file, the backend API,
or built-in sample data.

Usage:
    python generate_report.py                           # uses sample data
    python generate_report.py --json data.json          # reads from file
    python generate_report.py --api http://host/api/... # fetches from API
    python generate_report.py --output my_report.pdf    # custom output name
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime
from typing import Any

# ---------------------------------------------------------------------------
# fpdf2 is required — abort clearly if missing
# ---------------------------------------------------------------------------
try:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
except ImportError:
    print(
        "ERROR: fpdf2 is required.  Install it with:\n"
        "    pip install fpdf2",
        file=sys.stderr,
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# matplotlib is optional — charts are skipped gracefully when absent
# ---------------------------------------------------------------------------
_HAS_MATPLOTLIB = False
try:
    import matplotlib

    matplotlib.use("Agg")  # non-interactive backend
    import matplotlib.pyplot as plt

    _HAS_MATPLOTLIB = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# httpx is optional — only needed for --api mode
# ---------------------------------------------------------------------------
_HAS_HTTPX = False
try:
    import httpx

    _HAS_HTTPX = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Brand constants
# ---------------------------------------------------------------------------
NAVY = (15, 23, 42)       # #0f172a
BLUE = (59, 130, 246)     # #3b82f6
LIGHT_BLUE = (147, 197, 253)  # #93c5fd
LIGHTER_BLUE = (219, 234, 254)  # #dbeafe
WHITE = (255, 255, 255)
GRAY = (100, 116, 139)    # #64748b
LIGHT_GRAY = (241, 245, 249)  # #f1f5f9
DARK_TEXT = (30, 41, 59)  # #1e293b
GREEN = (34, 197, 94)
RED = (239, 68, 68)
AMBER = (245, 158, 11)

# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------
SAMPLE_DATA: dict[str, Any] = {
    "period": {"start": "2026-03-19", "end": "2026-03-26"},
    "kpis": {
        "total_prompts": 2847,
        "threats_blocked": 143,
        "cost_saved": 12450,
        "shadow_ai_events": 23,
    },
    "department_threats": {
        "Engineering": 42,
        "Sales": 38,
        "Marketing": 21,
        "HR": 18,
        "Finance": 15,
        "Executive": 9,
    },
    "daily_trend": [
        {"date": "2026-03-20", "threats": 18},
        {"date": "2026-03-21", "threats": 24},
        {"date": "2026-03-22", "threats": 15},
        {"date": "2026-03-23", "threats": 31},
        {"date": "2026-03-24", "threats": 22},
        {"date": "2026-03-25", "threats": 19},
        {"date": "2026-03-26", "threats": 14},
    ],
    "top_risk_employees": [
        {"name": "Marcus Chen", "department": "Engineering", "risk_score": 78, "incidents": 12},
        {"name": "Sarah Williams", "department": "Sales", "risk_score": 71, "incidents": 9},
        {"name": "David Park", "department": "Finance", "risk_score": 65, "incidents": 8},
        {"name": "Jennifer Adams", "department": "HR", "risk_score": 58, "incidents": 6},
        {"name": "Tom Bradley", "department": "Marketing", "risk_score": 52, "incidents": 5},
    ],
    "detection_breakdown": {
        "PII": 67,
        "Secrets": 34,
        "Policy Violations": 28,
        "Shadow AI": 14,
    },
    "compliance": {
        "soc2": "Compliant",
        "gdpr": "Compliant",
        "ccpa": "Action Required",
    },
}


# ===================================================================
# Chart generators (return path to temp PNG or None)
# ===================================================================

def _chart_department_threats(data: dict[str, int]) -> str | None:
    """Horizontal bar chart — threats by department."""
    if not _HAS_MATPLOTLIB:
        return None
    if not data:
        return None

    departments = list(data.keys())
    counts = list(data.values())

    # Sort ascending so the largest bar is at the top visually
    pairs = sorted(zip(counts, departments))
    counts = [p[0] for p in pairs]
    departments = [p[1] for p in pairs]

    n = len(departments)
    # Gradient from lighter to darker navy/blue
    bar_colors = [
        (
            NAVY[0] / 255 + (BLUE[0] / 255 - NAVY[0] / 255) * i / max(n - 1, 1),
            NAVY[1] / 255 + (BLUE[1] / 255 - NAVY[1] / 255) * i / max(n - 1, 1),
            NAVY[2] / 255 + (BLUE[2] / 255 - NAVY[2] / 255) * i / max(n - 1, 1),
        )
        for i in range(n)
    ]

    fig, ax = plt.subplots(figsize=(7, 2.6))
    bars = ax.barh(departments, counts, color=bar_colors, height=0.6)

    # Value labels on bars
    for bar, count in zip(bars, counts):
        ax.text(
            bar.get_width() + 0.5,
            bar.get_y() + bar.get_height() / 2,
            str(count),
            va="center",
            fontsize=9,
            color="#1e293b",
            fontweight="bold",
        )

    ax.set_xlabel("Threat Count", fontsize=9, color="#64748b")
    ax.set_xlim(0, max(counts) * 1.15)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="y", labelsize=9)
    ax.tick_params(axis="x", labelsize=8)
    fig.tight_layout()

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    fig.savefig(tmp.name, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return tmp.name


def _chart_daily_trend(trend: list[dict[str, Any]]) -> str | None:
    """Line chart with area fill — daily threats over 7 days."""
    if not _HAS_MATPLOTLIB:
        return None
    if not trend:
        return None

    dates = [entry["date"][-5:] for entry in trend]  # MM-DD
    threats = [entry["threats"] for entry in trend]

    fig, ax = plt.subplots(figsize=(7, 2.4))
    ax.plot(
        dates,
        threats,
        color=(*[c / 255 for c in BLUE],),
        linewidth=2.5,
        marker="o",
        markersize=6,
        zorder=3,
    )
    ax.fill_between(
        dates,
        threats,
        alpha=0.15,
        color=(*[c / 255 for c in BLUE],),
    )

    # Data labels
    for i, (d, t) in enumerate(zip(dates, threats)):
        ax.annotate(
            str(t),
            (d, t),
            textcoords="offset points",
            xytext=(0, 10),
            ha="center",
            fontsize=8,
            fontweight="bold",
            color="#1e293b",
        )

    ax.set_ylabel("Threats", fontsize=9, color="#64748b")
    ax.set_ylim(0, max(threats) * 1.35)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="both", labelsize=8)
    ax.grid(axis="y", alpha=0.3, linestyle="--")
    fig.tight_layout()

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    fig.savefig(tmp.name, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return tmp.name


# ===================================================================
# SentinelReport — custom FPDF subclass
# ===================================================================

class SentinelReport(FPDF):
    """Branded PDF report for Sentinel AI Security."""

    def __init__(self, period_start: str, period_end: str, **kwargs: Any):
        super().__init__(**kwargs)
        self.period_start = period_start
        self.period_end = period_end
        self._temp_files: list[str] = []

    # -- Header -----------------------------------------------------------
    def header(self) -> None:
        # Navy bar
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 28, style="F")

        # White title text
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 16)
        self.set_xy(10, 5)
        self.cell(0, 10, "Sentinel Weekly Security Report", align="L")

        # Date range
        self.set_font("Helvetica", "", 10)
        self.set_xy(10, 15)
        self.cell(
            0,
            8,
            f"{self.period_start}  to  {self.period_end}",
            align="L",
        )

        # Reset position below header
        self.set_xy(10, 32)
        self.set_text_color(*DARK_TEXT)

    # -- Footer -----------------------------------------------------------
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 10, "Sentinel AI Security", align="L")
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="R")

    # -- Helpers ----------------------------------------------------------
    def _section_title(self, title: str) -> None:
        """Render a section heading with a colored left accent bar."""
        self.ln(4)
        y = self.get_y()
        # Accent bar
        self.set_fill_color(*BLUE)
        self.rect(10, y, 3, 8, style="F")
        # Title text
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*NAVY)
        self.set_xy(16, y)
        self.cell(0, 8, title)
        self.ln(10)
        self.set_text_color(*DARK_TEXT)

    def _register_temp(self, path: str) -> None:
        self._temp_files.append(path)

    def cleanup(self) -> None:
        """Delete any temporary chart images."""
        for path in self._temp_files:
            try:
                os.unlink(path)
            except OSError:
                pass

    # ===================================================================
    # Report sections
    # ===================================================================

    def add_kpi_summary(self, kpis: dict[str, Any]) -> None:
        """4 key metrics in a 2x2 card layout."""
        self._section_title("KPI Summary")

        cards = [
            ("Prompts Analyzed", f"{kpis['total_prompts']:,}", "+12%"),
            ("Threats Blocked", f"{kpis['threats_blocked']:,}", "+5%"),
            ("Est. Cost Saved", f"${kpis['cost_saved']:,}", "+18%"),
            ("Shadow AI Events", f"{kpis['shadow_ai_events']:,}", "-8%"),
        ]

        card_w = 88
        card_h = 28
        start_x = 12
        gap = 4
        start_y = self.get_y()  # capture once before drawing any cards

        for idx, (label, value, trend) in enumerate(cards):
            col = idx % 2
            row = idx // 2
            x = start_x + col * (card_w + gap)
            y = start_y + row * (card_h + gap)

            # Card background
            self.set_fill_color(*LIGHT_GRAY)
            self.rect(x, y, card_w, card_h, style="F")

            # Left accent
            self.set_fill_color(*BLUE)
            self.rect(x, y, 3, card_h, style="F")

            # Label
            self.set_font("Helvetica", "", 9)
            self.set_text_color(*GRAY)
            self.set_xy(x + 6, y + 3)
            self.cell(card_w - 10, 5, label)

            # Value
            self.set_font("Helvetica", "B", 18)
            self.set_text_color(*NAVY)
            self.set_xy(x + 6, y + 11)
            self.cell(card_w - 30, 10, value)

            # Trend arrow
            is_positive = trend.startswith("+")
            # For Shadow AI Events, a decrease is good
            is_good = is_positive if idx < 3 else not is_positive
            arrow = "^" if is_positive else "v"
            self.set_font("Helvetica", "B", 10)
            self.set_text_color(*(GREEN if is_good else RED))
            self.set_xy(x + card_w - 28, y + 13)
            self.cell(24, 8, f"{arrow} {trend}", align="R")

        self.set_text_color(*DARK_TEXT)
        # Move cursor below the 2x2 grid
        self.set_y(start_y + 2 * (card_h + gap) + 2)

    def add_department_threats_chart(self, dept_data: dict[str, int]) -> None:
        """Horizontal bar chart of threats by department."""
        self._section_title("Threats by Department")

        chart_path = _chart_department_threats(dept_data)
        if chart_path:
            self._register_temp(chart_path)
            self.image(chart_path, x=12, w=186)
            self.ln(4)
        else:
            # Fallback: simple text table when matplotlib is unavailable
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*GRAY)
            self.cell(0, 6, "(matplotlib not installed -- chart unavailable)",
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_font("Helvetica", "", 10)
            self.set_text_color(*DARK_TEXT)
            for dept, count in sorted(dept_data.items(), key=lambda x: -x[1]):
                self.cell(60, 7, f"  {dept}",
                          new_x=XPos.RIGHT, new_y=YPos.TOP)
                self.cell(30, 7, str(count),
                          new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(2)

    def add_daily_trend_chart(self, trend: list[dict[str, Any]]) -> None:
        """Line chart of daily threat counts."""
        self._section_title("Daily Threat Trend")

        chart_path = _chart_daily_trend(trend)
        if chart_path:
            self._register_temp(chart_path)
            self.image(chart_path, x=12, w=186)
            self.ln(4)
        else:
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*GRAY)
            self.cell(0, 6, "(matplotlib not installed -- chart unavailable)",
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_font("Helvetica", "", 10)
            self.set_text_color(*DARK_TEXT)
            for entry in trend:
                self.cell(40, 7, f"  {entry['date']}",
                          new_x=XPos.RIGHT, new_y=YPos.TOP)
                self.cell(30, 7, f"{entry['threats']} threats",
                          new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(2)

    def add_top_risk_employees(self, employees: list[dict[str, Any]]) -> None:
        """Table of top 5 risk employees with alternating row colors."""
        self._section_title("Top Risk Employees")

        col_widths = [16, 52, 42, 38, 38]
        headers = ["Rank", "Name", "Department", "Risk Score", "Incidents"]

        # Header row
        self.set_font("Helvetica", "B", 10)
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        x_start = 12
        self.set_x(x_start)
        for i, hdr in enumerate(headers):
            self.cell(col_widths[i], 9, hdr, border=0, fill=True, align="C")
        self.ln()

        # Data rows
        self.set_font("Helvetica", "", 9)
        for rank, emp in enumerate(employees, start=1):
            if rank % 2 == 0:
                self.set_fill_color(*LIGHTER_BLUE)
            else:
                self.set_fill_color(*LIGHT_GRAY)
            self.set_text_color(*DARK_TEXT)

            self.set_x(x_start)
            self.cell(col_widths[0], 8, str(rank), border=0, fill=True, align="C")
            self.cell(col_widths[1], 8, emp["name"], border=0, fill=True)
            self.cell(col_widths[2], 8, emp["department"], border=0, fill=True, align="C")

            # Risk score coloring
            score = emp["risk_score"]
            if score >= 70:
                self.set_text_color(*RED)
            elif score >= 55:
                self.set_text_color(*AMBER)
            else:
                self.set_text_color(*(34, 197, 94))
            self.cell(col_widths[3], 8, str(score), border=0, fill=True, align="C")

            self.set_text_color(*DARK_TEXT)
            self.cell(col_widths[4], 8, str(emp["incidents"]), border=0, fill=True, align="C")
            self.ln()

        self.set_text_color(*DARK_TEXT)
        self.ln(2)

    def add_detection_breakdown(self, breakdown: dict[str, int]) -> None:
        """Table of detection categories with counts and percentages."""
        self._section_title("Detection Type Breakdown")

        total = sum(breakdown.values())
        col_widths = [70, 50, 66]
        headers = ["Type", "Count", "Percentage"]

        # Header row
        self.set_font("Helvetica", "B", 10)
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        x_start = 12
        self.set_x(x_start)
        for i, hdr in enumerate(headers):
            self.cell(col_widths[i], 9, hdr, border=0, fill=True, align="C")
        self.ln()

        # Data rows
        self.set_font("Helvetica", "", 9)
        row_idx = 0
        max_bar_w = 36  # max width for the percentage bar in mm
        for det_type, count in sorted(breakdown.items(), key=lambda x: -x[1]):
            pct = (count / total * 100) if total else 0

            if row_idx % 2 == 0:
                row_bg = LIGHT_GRAY
            else:
                row_bg = LIGHTER_BLUE
            self.set_fill_color(*row_bg)
            self.set_text_color(*DARK_TEXT)

            row_y = self.get_y()
            self.set_x(x_start)
            self.cell(col_widths[0], 8, f"  {det_type}", border=0, fill=True)
            self.cell(col_widths[1], 8, str(count), border=0, fill=True, align="C")

            # Draw the percentage cell background first, then the bar on top
            bar_cell_x = self.get_x()
            self.cell(col_widths[2], 8, "", border=0, fill=True)

            # Draw filled bar
            bar_w = (pct / 100) * max_bar_w
            bar_x = bar_cell_x + 2
            bar_y = row_y + 1.5
            self.set_fill_color(*BLUE)
            self.rect(bar_x, bar_y, bar_w, 5, style="F")

            # Percentage label to the right of the bar
            self.set_font("Helvetica", "B", 8)
            self.set_text_color(*DARK_TEXT)
            self.set_xy(bar_x + max_bar_w + 2, row_y)
            self.cell(20, 8, f"{pct:.1f}%")

            self.set_font("Helvetica", "", 9)
            self.set_y(row_y + 8)
            row_idx += 1

        self.set_text_color(*DARK_TEXT)
        self.ln(2)

    def add_compliance_status(self, compliance: dict[str, str]) -> None:
        """Simple text section listing compliance framework statuses."""
        self._section_title("Compliance Status")

        framework_labels = {
            "soc2": "SOC 2 Type II",
            "gdpr": "GDPR",
            "ccpa": "CCPA",
        }

        self.set_font("Helvetica", "", 10)

        for key, label in framework_labels.items():
            status = compliance.get(key, "Unknown")
            self.set_x(18)

            # Status indicator
            if status.lower() == "compliant":
                indicator = "[PASS]"
                self.set_text_color(*GREEN)
            elif "action" in status.lower():
                indicator = "[ACTION REQUIRED]"
                self.set_text_color(*AMBER)
            else:
                indicator = "[FAIL]"
                self.set_text_color(*RED)

            self.set_font("Helvetica", "B", 10)
            self.cell(40, 8, indicator)
            self.set_text_color(*DARK_TEXT)
            self.set_font("Helvetica", "", 10)
            self.cell(50, 8, label)
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*GRAY)
            self.cell(0, 8, f"  Status: {status}",
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_text_color(*DARK_TEXT)

        self.ln(2)


# ===================================================================
# Data loading
# ===================================================================

def load_data(args: argparse.Namespace) -> dict[str, Any]:
    """Load report data from the specified source."""
    if args.json:
        with open(args.json, "r", encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        print(f"Loaded data from {args.json}")
        return data

    if args.api:
        if not _HAS_HTTPX:
            print(
                "ERROR: httpx is required for --api mode.  Install it with:\n"
                "    pip install httpx",
                file=sys.stderr,
            )
            sys.exit(1)
        base = args.api.rstrip("/")
        # Support passing either host root or direct weekly endpoint.
        if base.endswith("/api/reports/weekly"):
            weekly = httpx.get(base, timeout=15)
            weekly.raise_for_status()
            weekly_data = weekly.json()
            root = base[: -len("/api/reports/weekly")]
        else:
            root = base
            weekly = httpx.get(f"{root}/api/reports/weekly", timeout=15)
            weekly.raise_for_status()
            weekly_data = weekly.json()

        metrics = httpx.get(f"{root}/api/metrics", timeout=15)
        metrics.raise_for_status()
        metrics_data = metrics.json()

        employees = httpx.get(f"{root}/api/employees", timeout=15)
        employees.raise_for_status()
        employees_data = employees.json()

        prompts = httpx.get(f"{root}/api/prompts?limit=200", timeout=15)
        prompts.raise_for_status()
        prompts_data = prompts.json()

        alerts = httpx.get(f"{root}/api/alerts", timeout=15)
        alerts.raise_for_status()
        alerts_data = alerts.json()

        # Convert live backend payloads to report structure expected by this generator.
        detection_breakdown = {"PII": 0, "Secrets": 0, "Policy Violations": 0, "Shadow AI": 0}
        high_risk_count = 0
        dept_threats: dict[str, int] = {}
        by_day: dict[str, int] = {}
        employee_department = {int(e.get("id", 0)): str(e.get("department", "Unknown")) for e in employees_data}
        for p in prompts_data:
            risk = p.get("risk_level", "low")
            if risk in {"high", "critical"}:
                high_risk_count += 1
                dept = employee_department.get(int(p.get("employee_id", 0)), "Unknown")
                dept_threats[dept] = dept_threats.get(dept, 0) + 1
                created = str(p.get("created_at", ""))[:10]
                if created:
                    by_day[created] = by_day.get(created, 0) + 1
            tool = str(p.get("target_tool") or "").lower()
            if any(x in tool for x in ["shadow", "unknown-ai", "myfreegpt", "otter", "copy.ai"]):
                detection_breakdown["Shadow AI"] += 1
            try:
                detail = httpx.get(f"{root}/api/prompts/{p.get('id')}", timeout=15)
                if detail.status_code == 200:
                    for det in detail.json().get("detections", []):
                        dt = str(det.get("type", "")).lower()
                        if dt == "pii":
                            detection_breakdown["PII"] += 1
                        elif dt == "secret":
                            detection_breakdown["Secrets"] += 1
                        elif dt == "policy":
                            detection_breakdown["Policy Violations"] += 1
                        elif dt == "shadow_ai":
                            detection_breakdown["Shadow AI"] += 1
            except Exception:
                # Report generation should continue even if detail lookup fails.
                pass

        top_employees = sorted(
            employees_data,
            key=lambda e: float(e.get("risk_score", 0.0)),
            reverse=True,
        )[:5]
        top_risk = [
            {
                "name": e.get("name", "Unknown"),
                "department": e.get("department", "Unknown"),
                "risk_score": round(float(e.get("risk_score", 0.0)) * 100),
                "incidents": int(float(e.get("total_prompts", 0)) * float(e.get("risk_score", 0.0))),
            }
            for e in top_employees
        ]

        sorted_days = sorted(by_day.keys())[-7:]
        daily_trend = [{"date": day, "threats": by_day[day]} for day in sorted_days]
        if not daily_trend:
            daily_trend = [{"date": weekly_data.get("week_end", "N/A"), "threats": high_risk_count}]

        # Simple evidence-based compliance view for demo narrative.
        critical_alerts = sum(1 for a in alerts_data if str(a.get("severity", "")).lower() == "critical")
        compliance = {
            "soc2": "Action Required" if critical_alerts > 0 else "Compliant",
            "gdpr": "Action Required" if detection_breakdown["PII"] > 0 else "Compliant",
            "ccpa": "Action Required" if high_risk_count > 0 else "Compliant",
        }

        transformed = {
            "period": {
                "start": weekly_data.get("week_start", "N/A"),
                "end": weekly_data.get("week_end", "N/A"),
            },
            "kpis": {
                "total_prompts": int(metrics_data.get("prompts_analyzed", 0)),
                "threats_blocked": int(metrics_data.get("threats_blocked", 0)),
                "cost_saved": int(float(metrics_data.get("estimated_cost_saved_usd", 0.0))),
                "shadow_ai_events": int(metrics_data.get("shadow_ai_events", 0)),
            },
            "department_threats": dept_threats or {"Unknown": high_risk_count},
            "daily_trend": daily_trend,
            "top_risk_employees": top_risk,
            "detection_breakdown": detection_breakdown,
            "compliance": compliance,
        }
        print(f"Fetched live API data from {root}")
        return transformed

    print("Using built-in sample data")
    return SAMPLE_DATA


# ===================================================================
# PDF construction
# ===================================================================

def build_report(data: dict[str, Any], output_path: str) -> str:
    """Build the full PDF report and return the output path."""
    period = data.get("period", {})
    start = period.get("start", "N/A")
    end = period.get("end", "N/A")

    pdf = SentinelReport(period_start=start, period_end=end, orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # --- KPI Summary ---
    if "kpis" in data:
        pdf.add_kpi_summary(data["kpis"])

    # --- Department Threats Chart ---
    if "department_threats" in data:
        pdf.add_department_threats_chart(data["department_threats"])

    # --- Page break before charts & tables ---
    pdf.add_page()

    # --- Daily Trend Chart ---
    if "daily_trend" in data:
        pdf.add_daily_trend_chart(data["daily_trend"])

    # --- Top Risk Employees ---
    if "top_risk_employees" in data:
        pdf.add_top_risk_employees(data["top_risk_employees"])

    # --- Detection Breakdown ---
    if "detection_breakdown" in data:
        pdf.add_detection_breakdown(data["detection_breakdown"])

    # --- Compliance Status ---
    if "compliance" in data:
        pdf.add_compliance_status(data["compliance"])

    # --- Generated timestamp (disable auto-break so this stays on the current page) ---
    pdf.set_auto_page_break(auto=False)
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*GRAY)
    pdf.cell(
        0,
        6,
        f"Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} by Sentinel AI Security",
        align="C",
    )
    pdf.set_auto_page_break(auto=True, margin=20)

    # Write PDF
    pdf.output(output_path)
    pdf.cleanup()
    return output_path


# ===================================================================
# CLI entry-point
# ===================================================================

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a branded Sentinel Weekly Security Report (PDF).",
    )
    parser.add_argument(
        "--json",
        metavar="FILE",
        help="Path to a JSON file with report data",
    )
    parser.add_argument(
        "--api",
        metavar="URL",
        default=None,
        help="URL to fetch report data (default: http://localhost:8000/api/reports/weekly)",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default="sentinel_weekly_report.pdf",
        help="Output PDF file path (default: sentinel_weekly_report.pdf)",
    )
    args = parser.parse_args(argv)

    # If neither --json nor --api is provided, leave both as None
    # so load_data() falls back to SAMPLE_DATA.
    return args


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    data = load_data(args)
    output_path = build_report(data, args.output)
    abs_path = os.path.abspath(output_path)
    print(f"Report saved to: {abs_path}")


if __name__ == "__main__":
    main()
