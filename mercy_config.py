from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class MercyConfig(BaseSettings):
    """Production configuration contract for Mercy Legal AI.

    Settings are loaded from process environment and `.env`. New Mercy-owned
    variables use the `MERCY_` prefix, while several deployment-standard aliases
    such as `POSTGRES_URL`, `SUPABASE_URL`, `OPENAI_API_KEY`, and `STRIPE_*` are
    accepted for compatibility with hosting providers and existing code.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="MERCY_",
        case_sensitive=False,
        extra="ignore",
    )

    # Business / firm identity.
    business_name: str = "Mercy Legal AI"
    business_email: str = ""
    business_phone: str = ""
    dc_bar_number: str = ""
    support_email: str = ""
    support_url: str = ""

    # Runtime environment and API posture.
    mercy_env: Literal["local", "development", "staging", "prod", "production", "test", "verify"] = Field(
        default="local",
        validation_alias=AliasChoices("MERCY_ENV", "ENVIRONMENT"),
    )
    mercy_auth_mode: Literal["dev", "token", "supabase", "clerk", "disabled", ""] = Field(
        default="dev",
        validation_alias=AliasChoices("MERCY_AUTH_MODE"),
    )
    mercy_require_https: bool = Field(default=False, validation_alias=AliasChoices("MERCY_REQUIRE_HTTPS"))
    api_token: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_API_TOKEN"))
    core_api_token: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_CORE_API_TOKEN"))
    allowed_origins: str = Field(
        default="http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8000,http://localhost:8000",
        validation_alias=AliasChoices("MERCY_ALLOWED_ORIGINS"),
    )
    tenant_id: str = Field(default="local-dev-tenant", validation_alias=AliasChoices("MERCY_TENANT_ID"))
    user_id: str = Field(default="local-web-server", validation_alias=AliasChoices("MERCY_USER_ID"))
    roles: str = Field(default="attorney", validation_alias=AliasChoices("MERCY_ROLES"))
    retention_mode: str = Field(default="zero_retention", validation_alias=AliasChoices("MERCY_RETENTION_MODE"))
    default_tier: str = Field(default="free", validation_alias=AliasChoices("MERCY_DEFAULT_TIER"))
    upload_dir_raw: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_UPLOAD_DIR"))

    # LLM providers and model routing.
    llm_provider: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_LLM_PROVIDER"))
    llm_fast_model: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_LLM_FAST_MODEL"))
    llm_reasoning_model: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_LLM_REASONING_MODEL"))
    openai_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("OPENAI_API_KEY", "MERCY_OPENAI_API_KEY"))
    anthropic_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("ANTHROPIC_API_KEY", "MERCY_ANTHROPIC_API_KEY"))
    groq_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("GROQ_API_KEY", "MERCY_GROQ_API_KEY"))
    openrouter_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("OPENROUTER_API_KEY", "MERCY_OPENROUTER_API_KEY"))
    gemini_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "MERCY_GEMINI_API_KEY"))
    gemini_model: str = Field(default="gemini-2.0-flash", validation_alias=AliasChoices("GEMINI_MODEL", "MERCY_GEMINI_MODEL"))
    llm_openai_fast_model: str = Field(default="openai/gpt-4o-mini", validation_alias=AliasChoices("MERCY_LLM_OPENAI_FAST_MODEL"))
    llm_openai_reasoning_model: str = Field(default="openai/gpt-4o", validation_alias=AliasChoices("MERCY_LLM_OPENAI_REASONING_MODEL"))
    llm_anthropic_fast_model: str = Field(default="anthropic/claude-3-5-haiku-20241022", validation_alias=AliasChoices("MERCY_LLM_ANTHROPIC_FAST_MODEL"))
    llm_anthropic_reasoning_model: str = Field(default="anthropic/claude-3-5-sonnet-20241022", validation_alias=AliasChoices("MERCY_LLM_ANTHROPIC_REASONING_MODEL"))
    llm_groq_fast_model: str = Field(default="groq/llama-3.1-8b-instant", validation_alias=AliasChoices("MERCY_LLM_GROQ_FAST_MODEL"))
    llm_groq_reasoning_model: str = Field(default="groq/llama-3.3-70b-versatile", validation_alias=AliasChoices("MERCY_LLM_GROQ_REASONING_MODEL"))

    # Hermes internal reasoning layer.
    enable_hermes: bool = Field(default=True, validation_alias=AliasChoices("MERCY_ENABLE_HERMES"))
    hermes_primary_model: str = Field(
        default="openrouter/nousresearch/hermes-3-llama-3.1-405b",
        validation_alias=AliasChoices("MERCY_HERMES_MODEL", "MERCY_HERMES_PRIMARY_MODEL"),
    )
    hermes_fallback_model: str = Field(
        default="openrouter/nousresearch/hermes-3-mixtral-8x7b",
        validation_alias=AliasChoices("MERCY_HERMES_FALLBACK_MODEL"),
    )

    # Databases and retrieval backends. PostgreSQL + pgvector is primary.
    postgres_url: SecretStr | None = Field(default=None, validation_alias=AliasChoices("POSTGRES_URL", "MERCY_POSTGRES_URL"))
    database_url_override: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_DATABASE_URL"))
    pgvector_dsn: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_PGVECTOR_DSN"))
    pgvector_table: str = Field(default="mercy_dc_chunks", validation_alias=AliasChoices("MERCY_PGVECTOR_TABLE"))
    rag_vector_backend: Literal["local", "pgvector", "qdrant", "auto"] = Field(default="auto", validation_alias=AliasChoices("MERCY_RAG_VECTOR_BACKEND"))
    rag_graph_backend: Literal["local", "neo4j", "auto"] = Field(default="auto", validation_alias=AliasChoices("MERCY_RAG_GRAPH_BACKEND"))
    qdrant_url: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_QDRANT_URL", "QDRANT_URL"))
    qdrant_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_QDRANT_API_KEY", "QDRANT_API_KEY"))
    qdrant_collection: str = Field(default="dc_legal_knowledge", validation_alias=AliasChoices("MERCY_QDRANT_COLLECTION"))
    neo4j_uri: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_NEO4J_URI", "NEO4J_URI"))
    neo4j_user: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_NEO4J_USER", "NEO4J_USER"))
    neo4j_password: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_NEO4J_PASSWORD", "NEO4J_PASSWORD"))
    neo4j_database: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_NEO4J_DATABASE", "NEO4J_DATABASE"))

    # Supabase project, hosted Postgres, and auth.
    supabase_url: str | None = Field(default=None, validation_alias=AliasChoices("SUPABASE_URL", "MERCY_SUPABASE_URL"))
    supabase_db_url: SecretStr | None = Field(default=None, validation_alias=AliasChoices("SUPABASE_DB_URL", "MERCY_SUPABASE_DB_URL"))
    supabase_anon_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "MERCY_SUPABASE_ANON_KEY"))
    supabase_service_role_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY", "MERCY_SUPABASE_SERVICE_ROLE_KEY"))
    supabase_jwt_secret: SecretStr | None = Field(default=None, validation_alias=AliasChoices("SUPABASE_JWT_SECRET", "MERCY_SUPABASE_JWT_SECRET"))

    # Stripe billing and price IDs.
    stripe_secret_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("STRIPE_SECRET_KEY", "MERCY_STRIPE_SECRET_KEY"))
    stripe_webhook_secret: SecretStr | None = Field(default=None, validation_alias=AliasChoices("STRIPE_WEBHOOK_SECRET", "MERCY_STRIPE_WEBHOOK_SECRET"))
    stripe_customer_id: str | None = Field(default=None, validation_alias=AliasChoices("STRIPE_CUSTOMER_ID", "MERCY_STRIPE_CUSTOMER_ID"))
    stripe_price_solo: str | None = Field(default=None, validation_alias=AliasChoices("STRIPE_PRICE_SOLO", "MERCY_STRIPE_PRICE_SOLO"))
    stripe_price_small_firm: str | None = Field(default=None, validation_alias=AliasChoices("STRIPE_PRICE_SMALL_FIRM", "MERCY_STRIPE_PRICE_SMALL_FIRM"))
    stripe_price_practice: str | None = Field(default=None, validation_alias=AliasChoices("STRIPE_PRICE_PRACTICE", "MERCY_STRIPE_PRICE_PRACTICE"))

    # Auth and observability.
    langsmith_tracing: bool = Field(default=False, validation_alias=AliasChoices("LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2", "MERCY_LANGSMITH_TRACING"))
    langsmith_endpoint: str = Field(default="https://api.smith.langchain.com", validation_alias=AliasChoices("LANGSMITH_ENDPOINT", "LANGCHAIN_ENDPOINT", "MERCY_LANGSMITH_ENDPOINT"))
    langsmith_project: str = Field(default="mercy-legal-core-prod", validation_alias=AliasChoices("LANGSMITH_PROJECT", "LANGCHAIN_PROJECT", "MERCY_LANGSMITH_PROJECT"))
    langsmith_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("LANGSMITH_API_KEY", "LANGCHAIN_API_KEY", "MERCY_LANGSMITH_API_KEY"))

    # Email and alerting.
    resend_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("RESEND_API_KEY", "MERCY_RESEND_API_KEY"))
    email_from: str = Field(default="Mercy Legal AI <support@example.com>", validation_alias=AliasChoices("MERCY_EMAIL_FROM"))
    alert_email_to: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_ALERT_EMAIL_TO"))
    alert_slack_webhook: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_ALERT_SLACK_WEBHOOK", "SLACK_WEBHOOK_URL"))
    smtp_host: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_SMTP_HOST", "SMTP_HOST"))
    smtp_port: int = Field(default=587, validation_alias=AliasChoices("MERCY_SMTP_PORT", "SMTP_PORT"))
    smtp_user: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_SMTP_USER", "SMTP_USER"))
    smtp_password: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MERCY_SMTP_PASSWORD", "SMTP_PASSWORD"))
    smtp_use_tls: bool = Field(default=True, validation_alias=AliasChoices("MERCY_SMTP_USE_TLS", "SMTP_USE_TLS"))

    # Limits, quotas, and safety thresholds.
    daily_tenant_cost_cap_usd: float = Field(default=0.0, validation_alias=AliasChoices("MERCY_DAILY_TENANT_COST_CAP_USD", "MERCY_MONITORING_TENANT_DAILY_COST_CAP_USD"))
    monthly_tenant_cost_cap_usd: float = Field(default=0.0, validation_alias=AliasChoices("MERCY_MONTHLY_TENANT_COST_CAP_USD"))
    beta_strong_monthly_quota: int = Field(default=50, validation_alias=AliasChoices("MERCY_BETA_STRONG_MONTHLY_QUOTA"))
    rate_limit_per_minute: int = Field(default=120, validation_alias=AliasChoices("MERCY_RATE_LIMIT_PER_MINUTE"))
    max_upload_mb: int = Field(default=25, validation_alias=AliasChoices("MERCY_MAX_UPLOAD_MB"))
    max_context_chars: int = Field(default=120000, validation_alias=AliasChoices("MERCY_MAX_CONTEXT_CHARS"))
    alert_cost_spike_usd: float = Field(default=25.0, validation_alias=AliasChoices("MERCY_ALERT_COST_SPIKE_USD"))
    alert_guardrail_failures: int = Field(default=10, validation_alias=AliasChoices("MERCY_ALERT_GUARDRAIL_FAILURES"))
    alert_error_rate: float = Field(default=0.10, validation_alias=AliasChoices("MERCY_ALERT_ERROR_RATE"))

    # Seeding / eval / fine-tune helpers.
    seed_tenant_id: str = Field(default="public", validation_alias=AliasChoices("MERCY_SEED_TENANT_ID"))
    seed_user_id: str = Field(default="dc-knowledge-seeder", validation_alias=AliasChoices("MERCY_SEED_USER_ID"))
    seed_min_chunks: int = Field(default=500, validation_alias=AliasChoices("MERCY_SEED_MIN_CHUNKS"))
    seed_llm_limit: int = Field(default=20, validation_alias=AliasChoices("MERCY_SEED_LLM_LIMIT"))
    seed_report_path: str = Field(default="reports/dc_knowledge_seed_latest.json", validation_alias=AliasChoices("MERCY_SEED_REPORT_PATH"))
    ragas_regression_report: str | None = Field(default=None, validation_alias=AliasChoices("MERCY_RAGAS_REGRESSION_REPORT"))
    enable_real_lora_training: bool = Field(default=False, validation_alias=AliasChoices("MERCY_ENABLE_REAL_LORA_TRAINING"))

    @field_validator("business_email", "support_email", "alert_email_to")
    @classmethod
    def strip_email(cls, value: str | None) -> str:
        return (value or "").strip()

    @field_validator("allowed_origins")
    @classmethod
    def normalize_origins(cls, value: str) -> str:
        return ",".join(origin.strip() for origin in value.split(",") if origin.strip())

    @property
    def is_local(self) -> bool:
        return self.mercy_env in {"local", "development", "test", "verify"}

    @property
    def database_url(self) -> str | None:
        supabase_database_url = None
        if self.supabase_url and self.supabase_url.startswith(("postgres://", "postgresql://")):
            supabase_database_url = self.supabase_url
        return first_secret(
            self.postgres_url,
            self.database_url_override,
            self.supabase_db_url,
            self.pgvector_dsn,
        ) or supabase_database_url

    @property
    def effective_api_token(self) -> str | None:
        return first_secret(self.api_token, self.core_api_token)

    @property
    def mercy_api_token(self) -> str | None:
        return first_secret(self.api_token)

    @property
    def mercy_core_api_token(self) -> str | None:
        return first_secret(self.core_api_token)

    @property
    def mercy_allowed_origins(self) -> str:
        return self.allowed_origins

    @property
    def mercy_upload_dir(self) -> str | None:
        return self.upload_dir_raw

    @property
    def mercy_default_tier(self) -> str:
        return self.default_tier

    @property
    def mercy_retention_mode(self) -> str:
        return self.retention_mode

    @property
    def mercy_database_url(self) -> str | None:
        return first_secret(self.database_url_override)

    @property
    def upload_dir(self) -> Path:
        if self.upload_dir_raw:
            return Path(self.upload_dir_raw).expanduser()
        return Path(__file__).resolve().parent / "legal_discovery_ai" / "data" / "uploads"

    @property
    def stripe_price_ids(self) -> dict[str, str | None]:
        return {
            "solo": self.stripe_price_solo,
            "small_firm": self.stripe_price_small_firm,
            "practice": self.stripe_price_practice,
        }

    def get_hermes_model(self, *, prefer_fallback: bool = False) -> str:
        if not self.enable_hermes:
            return self.llm_reasoning_model or self.llm_fast_model or self.hermes_fallback_model
        return self.hermes_fallback_model if prefer_fallback else self.hermes_primary_model

    def readiness_issues(self, *, strict: bool = False) -> list[str]:
        issues: list[str] = []
        production_like = not self.is_local or strict

        if not self.business_name.strip():
            issues.append("MERCY_BUSINESS_NAME is required.")
        if production_like and not self.business_email:
            issues.append("MERCY_BUSINESS_EMAIL is required for production.")
        if production_like and not self.dc_bar_number:
            issues.append("MERCY_DC_BAR_NUMBER is required for D.C. attorney-facing production.")
        if production_like and self.mercy_auth_mode == "dev":
            issues.append("MERCY_AUTH_MODE=dev is not production safe.")
        if production_like and not self.mercy_require_https:
            issues.append("MERCY_REQUIRE_HTTPS=true is required for production.")
        if production_like and not self.database_url:
            issues.append("POSTGRES_URL or SUPABASE_DB_URL is required for persistent PostgreSQL + pgvector storage.")
        if production_like and not self.effective_api_token and self.mercy_auth_mode in {"token", ""}:
            issues.append("MERCY_API_TOKEN or MERCY_CORE_API_TOKEN is required for token auth.")
        if production_like and self.mercy_auth_mode == "supabase":
            if not self.supabase_url or not self.supabase_anon_key or not self.supabase_jwt_secret:
                issues.append("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_JWT_SECRET are required for Supabase auth.")
        if not any([self.openai_api_key, self.anthropic_api_key, self.groq_api_key, self.openrouter_api_key, self.gemini_api_key]):
            issues.append("At least one LLM provider key is required.")
        if self.enable_hermes and self.hermes_primary_model.startswith("openrouter/") and not self.openrouter_api_key:
            issues.append("OPENROUTER_API_KEY is recommended when Mercy Hermes uses OpenRouter-hosted Hermes models.")
        if production_like and self.stripe_secret_key and not self.stripe_webhook_secret:
            issues.append("STRIPE_WEBHOOK_SECRET is required when Stripe is enabled in production.")
        if production_like and not self.allowed_origins:
            issues.append("MERCY_ALLOWED_ORIGINS must explicitly list production web and Office origins.")
        if production_like and "*" in self.allowed_origins:
            issues.append("MERCY_ALLOWED_ORIGINS must not contain '*' in production.")
        if production_like and self.daily_tenant_cost_cap_usd <= 0:
            issues.append("MERCY_DAILY_TENANT_COST_CAP_USD should be set above 0 for production cost protection.")
        if self.langsmith_tracing and not self.langsmith_api_key:
            issues.append("LANGSMITH_API_KEY is required when LANGSMITH_TRACING=true.")
        return issues

    def is_production_ready(self, *, strict: bool = False) -> bool:
        return not self.readiness_issues(strict=strict)

    @classmethod
    def from_env(cls) -> "MercyConfig":
        return cls()


def first_secret(*values: SecretStr | str | None) -> str | None:
    for value in values:
        if isinstance(value, SecretStr):
            secret = value.get_secret_value()
            if secret:
                return secret
        elif value:
            return value
    return None


@lru_cache(maxsize=1)
def get_config() -> MercyConfig:
    return MercyConfig.from_env()


__all__ = ["MercyConfig", "get_config"]
