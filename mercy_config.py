from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


class MercyConfig(BaseModel):
    """Typed runtime configuration for the Mercy Legal AI core.

    The backend remains environment-variable driven for deployment simplicity,
    but centralizing the contract here keeps local, Supabase-hosted Postgres,
    and production setups aligned.
    """

    mercy_env: str = Field(default="local")
    mercy_auth_mode: str = Field(default="dev")
    mercy_api_token: str | None = Field(default=None)
    mercy_core_api_token: str | None = Field(default=None)
    mercy_allowed_origins: str | None = Field(default=None)

    postgres_url: str | None = Field(default=None)
    supabase_url: str | None = Field(default=None)
    supabase_db_url: str | None = Field(default=None)
    supabase_anon_key: str | None = Field(default=None)
    supabase_service_role_key: str | None = Field(default=None)
    supabase_jwt_secret: str | None = Field(default=None)
    mercy_database_url: str | None = Field(default=None)

    openai_api_key: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)
    groq_api_key: str | None = Field(default=None)
    gemini_api_key: str | None = Field(default=None)
    mercy_llm_provider: str | None = Field(default=None)
    mercy_llm_fast_model: str | None = Field(default=None)
    mercy_llm_reasoning_model: str | None = Field(default=None)

    mercy_retention_mode: str = Field(default="zero_retention")
    mercy_default_tier: str = Field(default="free")
    mercy_upload_dir: str | None = Field(default=None)

    @property
    def database_url(self) -> str | None:
        supabase_database_url = self.supabase_url if self.supabase_url and self.supabase_url.startswith(("postgres://", "postgresql://")) else None
        return self.postgres_url or self.mercy_database_url or self.supabase_db_url or supabase_database_url

    @property
    def effective_api_token(self) -> str | None:
        return self.mercy_api_token or self.mercy_core_api_token

    @property
    def upload_dir(self) -> Path:
        if self.mercy_upload_dir:
            return Path(self.mercy_upload_dir).expanduser()
        return Path(__file__).resolve().parent / "legal_discovery_ai" / "data" / "uploads"

    @classmethod
    def from_env(cls) -> "MercyConfig":
        return cls(
            mercy_env=os.getenv("MERCY_ENV") or "local",
            mercy_auth_mode=os.getenv("MERCY_AUTH_MODE") or "dev",
            mercy_api_token=os.getenv("MERCY_API_TOKEN"),
            mercy_core_api_token=os.getenv("MERCY_CORE_API_TOKEN"),
            mercy_allowed_origins=os.getenv("MERCY_ALLOWED_ORIGINS"),
            postgres_url=os.getenv("POSTGRES_URL"),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_db_url=os.getenv("SUPABASE_DB_URL"),
            supabase_anon_key=os.getenv("SUPABASE_ANON_KEY"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET"),
            mercy_database_url=os.getenv("MERCY_DATABASE_URL"),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            groq_api_key=os.getenv("GROQ_API_KEY"),
            gemini_api_key=os.getenv("GEMINI_API_KEY"),
            mercy_llm_provider=os.getenv("MERCY_LLM_PROVIDER"),
            mercy_llm_fast_model=os.getenv("MERCY_LLM_FAST_MODEL"),
            mercy_llm_reasoning_model=os.getenv("MERCY_LLM_REASONING_MODEL"),
            mercy_retention_mode=os.getenv("MERCY_RETENTION_MODE") or "zero_retention",
            mercy_default_tier=os.getenv("MERCY_DEFAULT_TIER") or "free",
            mercy_upload_dir=os.getenv("MERCY_UPLOAD_DIR"),
        )


@lru_cache(maxsize=1)
def get_config() -> MercyConfig:
    return MercyConfig.from_env()


__all__ = ["MercyConfig", "get_config"]
