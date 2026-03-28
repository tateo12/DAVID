from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import cors_allowed_origins, get_settings
from database import init_db
from routes import agents, alerts, analyze, auth, emails, employees, extension, metrics, operations, policies, prompts, reports, scout, shadow_ai

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(analyze.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(extension.router, prefix=settings.api_prefix)
app.include_router(metrics.router, prefix=settings.api_prefix)
app.include_router(employees.router, prefix=settings.api_prefix)
app.include_router(prompts.router, prefix=settings.api_prefix)
app.include_router(policies.router, prefix=settings.api_prefix)
app.include_router(reports.router, prefix=settings.api_prefix)
app.include_router(shadow_ai.router, prefix=settings.api_prefix)
app.include_router(alerts.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(operations.router, prefix=settings.api_prefix)
app.include_router(emails.router, prefix=settings.api_prefix)
app.include_router(scout.router, prefix=settings.api_prefix)
