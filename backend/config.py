from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Sentinel Backend"
    app_env: str = "dev"
    api_prefix: str = "/api"
    allowed_origin: str = "http://localhost:3000"

    sqlite_path: str = "sentinel.db"

    anthropic_api_key: str = ""
    l2_model_name: str = "claude-3-haiku-20240307"
    l3_model_name: str = "claude-3-5-sonnet-20240620"
    enable_l2: bool = False
    enable_l3: bool = False
    l1_confidence_threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    l2_confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)

    daily_budget_usd: float = 50.0
    default_agent_budget_usd: float = 10.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
