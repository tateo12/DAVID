from typing import Optional

from fastapi import APIRouter, Depends, Header

from auth import get_org_id, require_ops_manager, resolve_org_id
from database import fetch_rows
from engines.reporting_engine import latest_weekly_report
from models import AutomationAnalysisResponse, AutomationOpportunity, WeeklyReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/weekly", response_model=WeeklyReportResponse)
def weekly_report(
    current_user: dict = Depends(require_ops_manager),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> WeeklyReportResponse:
    org_id = resolve_org_id(current_user, x_org_id)
    return latest_weekly_report(org_id=org_id)


HUMAN_BASELINES = {
    "data_entry": {
        "human_cost": 15.0,
        "human_time_sec": 900,  # 15 mins
        "insight": "AI excels at rapid, repetitive data extraction, operating 50x faster with near-zero error rates.",
    },
    "customer_support_triage": {
        "human_cost": 5.0,
        "human_time_sec": 300,  # 5 mins
        "insight": "AI can instantly categorize and route tickets. Humans remain essential for nuanced, high-stakes customer escalations.",
    },
    "code_review": {
        "human_cost": 35.0,
        "human_time_sec": 1800,  # 30 mins
        "insight": "AI is highly effective at catching syntax and known security flaws, but human oversight is strictly required for architectural decisions and business logic.",
    },
    "report_generation": {
        "human_cost": 45.0,
        "human_time_sec": 3600,  # 60 mins
        "insight": "AI can synthesize vast amounts of structured data instantly. Humans are only needed for final narrative polish.",
    },
    "sentiment_analysis": {
        "human_cost": 2.5,
        "human_time_sec": 120,   # 2 mins
        "insight": "AI processes sentiment at scale reliably. However, humans are better at detecting sarcasm or complex cultural context in edge-cases.",
    },
}

@router.get("/automation-analysis", response_model=AutomationAnalysisResponse)
def automation_analysis(
    current_user: dict = Depends(require_ops_manager),
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-Id"),
) -> AutomationAnalysisResponse:
    org_id = resolve_org_id(current_user, x_org_id)
    rows = fetch_rows(
        """
        SELECT
            ar.task_type,
            COALESCE(AVG(ar.cost_usd), 0.0) as avg_ai_cost,
            COALESCE(AVG(ar.latency_ms), 0) as avg_latency_ms
        FROM agent_runs ar
        JOIN agent_budgets ab ON ab.id = ar.agent_id AND ab.org_id = ?
        GROUP BY ar.task_type
        """,
        (org_id,),
    )
    
    opportunities: list[AutomationOpportunity] = []
    
    # Process existing database stats
    db_tasks = set()
    for row in rows:
        task_type = row["task_type"]
        db_tasks.add(task_type)
        ai_cost = float(row["avg_ai_cost"])
        ai_time_sec = float(row["avg_latency_ms"]) / 1000.0
        
        baseline = HUMAN_BASELINES.get(task_type, {"human_cost": 20.0, "human_time_sec": 1200, "insight": "No specific insight."})
        human_cost = baseline["human_cost"]
        human_time_sec = baseline["human_time_sec"]
        
        cost_deficit = human_cost - ai_cost
        time_deficit = human_time_sec - ai_time_sec
        
        # Determine automation status
        if cost_deficit > 10.0 and time_deficit > 600:
            status = "Automate"
        elif cost_deficit > 0:
            status = "Human-in-Loop"
        else:
            status = "Human-Driven"
            
        opportunities.append(AutomationOpportunity(
            task_type=task_type.replace("_", " ").title(),
            human_cost=round(human_cost, 2),
            ai_cost=round(ai_cost, 4),
            cost_deficit=round(cost_deficit, 2),
            human_time_sec=round(human_time_sec, 1),
            ai_time_sec=round(ai_time_sec, 2),
            time_deficit=round(time_deficit, 1),
            automation_status=status,
            management_insight=baseline["insight"]
        ))
        
    # If the database is empty or missing our key demo tasks, inject the baseline items
    for task_type, baseline in HUMAN_BASELINES.items():
        if task_type not in db_tasks:
            ai_cost = 0.005 if task_type == "sentiment_analysis" else 0.05
            ai_time_sec = 1.2 if task_type == "sentiment_analysis" else 5.5
            
            human_cost = baseline["human_cost"]
            human_time_sec = baseline["human_time_sec"]
            
            cost_deficit = human_cost - ai_cost
            time_deficit = human_time_sec - ai_time_sec
            
            if cost_deficit > 10.0 and time_deficit > 600:
                status = "Automate"
            elif cost_deficit > 0:
                status = "Human-in-Loop"
            else:
                status = "Human-Driven"
                
            opportunities.append(AutomationOpportunity(
                task_type=task_type.replace("_", " ").title(),
                human_cost=round(human_cost, 2),
                ai_cost=round(ai_cost, 4),
                cost_deficit=round(cost_deficit, 2),
                human_time_sec=round(human_time_sec, 1),
                ai_time_sec=round(ai_time_sec, 2),
                time_deficit=round(time_deficit, 1),
                automation_status=status,
                management_insight=baseline["insight"]
            ))

    # Sort so Automate is first, then highest cost deficit
    opportunities.sort(key=lambda o: (0 if o.automation_status == "Automate" else 1 if o.automation_status == "Human-in-Loop" else 2, -o.cost_deficit))

    return AutomationAnalysisResponse(opportunities=opportunities)
