from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Sentinel Backend"
    app_env: str = "dev"
    api_prefix: str = "/api"
    allowed_origins: str = "*"

    sqlite_path: str = "sentinel.db"
    database_url: str | None = Field(default=None, validation_alias=AliasChoices("DATABASE_URL"))

    anthropic_api_key: str = ""
    openrouter_api_key: str = Field(default="", validation_alias=AliasChoices("OPENROUTER_API_KEY", "API_SECRET_KEY"))
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_site_url: str = Field(default="http://localhost:3000", validation_alias=AliasChoices("OPENROUTER_SITE_URL"))
    openrouter_app_name: str = "Sentinel"
    l2_model_name: str = "google/gemma-3-4b-it:free"
    l3_model_name: str = "nvidia/nemotron-nano-12b-v2-vl:free"
    enable_l2: bool = True
    enable_l3: bool = True
    l1_confidence_threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    l2_confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)

    daily_budget_usd: float = 50.0
    default_agent_budget_usd: float = 10.0

    resend_api_key: str = Field(default="", validation_alias=AliasChoices("RESEND_API_KEY"))
    email_from_address: str = "Sentinel <noreply@sentinel-ai-security.com>"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_address: str = "sentinel@company.com"
    smtp_use_tls: bool = True
    alert_email: str = ""
    skill_model_name: str = "google/gemma-3-4b-it:free"

    # First-time setup: when the users table is empty, create one manager account (no fake employees).
    initial_admin_username: str = Field(
        default="",
        validation_alias=AliasChoices("SENTINEL_INITIAL_ADMIN_USERNAME", "INITIAL_ADMIN_USERNAME"),
    )
    initial_admin_password: str = Field(
        default="",
        validation_alias=AliasChoices("SENTINEL_INITIAL_ADMIN_PASSWORD", "INITIAL_ADMIN_PASSWORD"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def resolved_database_url() -> str:
    """Effective SQLite file URL or PostgreSQL DSN (from DATABASE_URL or sqlite_path)."""
    s = get_settings()
    if s.database_url and str(s.database_url).strip():
        u = str(s.database_url).strip()
        if u.startswith("postgres://"):
            u = "postgresql://" + u[len("postgres://") :]
        if u.startswith("postgresql+psycopg://"):
            u = "postgresql://" + u[len("postgresql+psycopg://") :]
        return u
    base = Path(__file__).resolve().parent / s.sqlite_path
    return f"sqlite:///{base.as_posix()}"


def is_postgresql_database() -> bool:
    return resolved_database_url().startswith("postgresql")


def frontend_base_url() -> str:
    """First origin in allowed_origins, or localhost default (email links, CORS docs)."""
    parts = [p.strip() for p in get_settings().allowed_origins.split(",") if p.strip()]
    return parts[0] if parts else "http://localhost:3000"


def openrouter_chat_completions_url() -> str:
    return f"{get_settings().openrouter_base_url.rstrip('/')}/chat/completions"


def cors_allowed_origins() -> list[str]:
    parts = [p.strip() for p in get_settings().allowed_origins.split(",") if p.strip()]
    return parts if parts else ["*"]
