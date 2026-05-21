from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
EXAMPLE_PATH = ROOT / ".env.example"


@dataclass(frozen=True)
class EnvSpec:
    key: str
    label: str
    default: str = ""
    secret: bool = False
    required_prod: bool = False
    choices: tuple[str, ...] = ()


GROUPS: list[tuple[str, list[EnvSpec]]] = [
    (
        "Business / Firm",
        [
            EnvSpec("MERCY_BUSINESS_NAME", "Business or product name", "Mercy Legal AI", required_prod=True),
            EnvSpec("MERCY_BUSINESS_EMAIL", "Business email", "support@example.com", required_prod=True),
            EnvSpec("MERCY_BUSINESS_PHONE", "Business phone"),
            EnvSpec("MERCY_DC_BAR_NUMBER", "D.C. Bar number", required_prod=True),
            EnvSpec("MERCY_SUPPORT_EMAIL", "Support email", "support@example.com"),
            EnvSpec("MERCY_SUPPORT_URL", "Support URL", "https://example.com/support"),
        ],
    ),
    (
        "Environment / Auth",
        [
            EnvSpec("MERCY_ENV", "Environment", "local", required_prod=True, choices=("local", "development", "staging", "prod", "production")),
            EnvSpec("MERCY_AUTH_MODE", "Auth mode", "dev", required_prod=True, choices=("dev", "test", "supabase", "clerk")),
            EnvSpec("MERCY_REQUIRE_HTTPS", "Require HTTPS", "false", required_prod=True, choices=("true", "false")),
            EnvSpec("MERCY_API_TOKEN", "Backend bearer token", secret=True),
            EnvSpec("MERCY_CORE_API_TOKEN", "Core API token", secret=True),
            EnvSpec("MERCY_TENANT_ID", "Local tenant ID", "local-dev-tenant"),
            EnvSpec("MERCY_USER_ID", "Local user ID", "local-web-server"),
            EnvSpec("MERCY_ROLES", "Local roles", "attorney"),
            EnvSpec("MERCY_ALLOWED_ORIGINS", "Allowed CORS origins", "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8000,http://localhost:8000"),
            EnvSpec("MERCY_RETENTION_MODE", "Retention mode", "zero_retention"),
            EnvSpec("MERCY_DEFAULT_TIER", "Default tenant tier", "free"),
            EnvSpec("MERCY_UPLOAD_DIR", "Upload directory"),
        ],
    ),
    (
        "LLM Providers / Hermes",
        [
            EnvSpec("MERCY_LLM_PROVIDER", "Preferred LLM provider", choices=("openai", "anthropic", "groq", "openrouter", "gemini", "")),
            EnvSpec("OPENAI_API_KEY", "OpenAI API key", secret=True),
            EnvSpec("ANTHROPIC_API_KEY", "Anthropic API key", secret=True),
            EnvSpec("GROQ_API_KEY", "Groq API key", secret=True),
            EnvSpec("OPENROUTER_API_KEY", "OpenRouter API key", secret=True),
            EnvSpec("GEMINI_API_KEY", "Gemini API key", secret=True),
            EnvSpec("GEMINI_MODEL", "Gemini model", "gemini-2.0-flash"),
            EnvSpec("MERCY_LLM_FAST_MODEL", "Default fast model"),
            EnvSpec("MERCY_LLM_REASONING_MODEL", "Default reasoning model"),
            EnvSpec("MERCY_LLM_OPENAI_FAST_MODEL", "OpenAI fast model", "openai/gpt-4o-mini"),
            EnvSpec("MERCY_LLM_OPENAI_REASONING_MODEL", "OpenAI reasoning model", "openai/gpt-4o"),
            EnvSpec("MERCY_LLM_ANTHROPIC_FAST_MODEL", "Anthropic fast model", "anthropic/claude-3-5-haiku-20241022"),
            EnvSpec("MERCY_LLM_ANTHROPIC_REASONING_MODEL", "Anthropic reasoning model", "anthropic/claude-3-5-sonnet-20241022"),
            EnvSpec("MERCY_LLM_GROQ_FAST_MODEL", "Groq fast model", "groq/llama-3.1-8b-instant"),
            EnvSpec("MERCY_LLM_GROQ_REASONING_MODEL", "Groq reasoning model", "groq/llama-3.3-70b-versatile"),
            EnvSpec("MERCY_ENABLE_HERMES", "Enable Hermes", "true", choices=("true", "false")),
            EnvSpec("MERCY_HERMES_MODEL", "Hermes primary model", "openrouter/nousresearch/hermes-3-llama-3.1-405b"),
            EnvSpec("MERCY_HERMES_FALLBACK_MODEL", "Hermes fallback model", "openrouter/nousresearch/hermes-3-mixtral-8x7b"),
        ],
    ),
    (
        "Databases / Retrieval",
        [
            EnvSpec("POSTGRES_URL", "PostgreSQL + pgvector URL", required_prod=True, secret=True),
            EnvSpec("MERCY_DATABASE_URL", "Alternate database URL", secret=True),
            EnvSpec("MERCY_PGVECTOR_DSN", "pgvector DSN", secret=True),
            EnvSpec("MERCY_PGVECTOR_TABLE", "pgvector table", "mercy_dc_chunks"),
            EnvSpec("MERCY_RAG_VECTOR_BACKEND", "Vector backend", "auto", choices=("auto", "pgvector", "qdrant", "local")),
            EnvSpec("MERCY_RAG_GRAPH_BACKEND", "Graph backend", "auto", choices=("auto", "neo4j", "local")),
            EnvSpec("MERCY_QDRANT_URL", "Qdrant URL"),
            EnvSpec("MERCY_QDRANT_API_KEY", "Qdrant API key", secret=True),
            EnvSpec("MERCY_QDRANT_COLLECTION", "Qdrant collection", "dc_legal_knowledge"),
            EnvSpec("MERCY_NEO4J_URI", "Neo4j URI"),
            EnvSpec("MERCY_NEO4J_USER", "Neo4j user"),
            EnvSpec("MERCY_NEO4J_PASSWORD", "Neo4j password", secret=True),
            EnvSpec("MERCY_NEO4J_DATABASE", "Neo4j database"),
            EnvSpec("SUPABASE_URL", "Supabase project URL"),
            EnvSpec("SUPABASE_DB_URL", "Supabase Postgres pooler URL", secret=True),
            EnvSpec("SUPABASE_ANON_KEY", "Supabase anon key", secret=True),
            EnvSpec("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key", secret=True),
            EnvSpec("SUPABASE_JWT_SECRET", "Supabase JWT secret", secret=True),
            EnvSpec("MERCY_OFFICE_NAA_ENABLED", "Enable Microsoft Office NAA", "false", choices=("true", "false")),
            EnvSpec("MERCY_OFFICE_PKCE_FALLBACK_ENABLED", "Enable Office PKCE fallback", "true", choices=("true", "false")),
            EnvSpec("MICROSOFT_ENTRA_TENANT_ID", "Microsoft Entra tenant ID"),
            EnvSpec("MICROSOFT_ENTRA_CLIENT_ID", "Microsoft Entra client ID"),
            EnvSpec("MICROSOFT_ENTRA_APPLICATION_ID_URI", "Microsoft Entra application ID URI"),
            EnvSpec("MICROSOFT_ENTRA_ISSUER", "Microsoft Entra token issuer"),
            EnvSpec("MICROSOFT_ENTRA_JWKS_URL", "Microsoft Entra JWKS URL"),
            EnvSpec("MERCY_MICROSOFT_IDENTITY_MAP_JSON", "Microsoft to Mercy identity map JSON", secret=True),
            EnvSpec("MERCY_OFFICE_PKCE_PROVIDER", "Supabase OAuth provider for Office popup fallback"),
            EnvSpec("MERCY_SUPABASE_AZURE_PROVIDER_ENABLED", "Azure provider is enabled in Supabase Auth", "false", choices=("true", "false")),
        ],
    ),
    (
        "Stripe / Billing",
        [
            EnvSpec("STRIPE_SECRET_KEY", "Stripe secret key", secret=True),
            EnvSpec("STRIPE_WEBHOOK_SECRET", "Stripe webhook secret", secret=True),
            EnvSpec("STRIPE_CUSTOMER_ID", "Stripe customer ID"),
            EnvSpec("STRIPE_PRICE_SOLO", "Solo plan price ID"),
            EnvSpec("STRIPE_PRICE_SMALL_FIRM", "Small firm plan price ID"),
            EnvSpec("STRIPE_PRICE_PRACTICE", "Practice plan price ID"),
        ],
    ),
    (
        "Observability / Alerts / Email",
        [
            EnvSpec("LANGSMITH_TRACING", "Enable LangSmith tracing", "false", choices=("true", "false")),
            EnvSpec("LANGSMITH_ENDPOINT", "LangSmith endpoint", "https://api.smith.langchain.com"),
            EnvSpec("LANGSMITH_PROJECT", "LangSmith project", "mercy-legal-core-prod"),
            EnvSpec("LANGSMITH_API_KEY", "LangSmith API key", secret=True),
            EnvSpec("RESEND_API_KEY", "Resend API key", secret=True),
            EnvSpec("MERCY_EMAIL_FROM", "Email from", "Mercy Legal AI <support@example.com>"),
            EnvSpec("MERCY_ALERT_EMAIL_TO", "Alert email recipient"),
            EnvSpec("MERCY_ALERT_SLACK_WEBHOOK", "Slack alert webhook", secret=True),
            EnvSpec("MERCY_SMTP_HOST", "SMTP host"),
            EnvSpec("MERCY_SMTP_PORT", "SMTP port", "587"),
            EnvSpec("MERCY_SMTP_USER", "SMTP user"),
            EnvSpec("MERCY_SMTP_PASSWORD", "SMTP password", secret=True),
            EnvSpec("MERCY_SMTP_USE_TLS", "SMTP TLS", "true", choices=("true", "false")),
        ],
    ),
    (
        "Limits / Operations",
        [
            EnvSpec("MERCY_DAILY_TENANT_COST_CAP_USD", "Daily tenant cost cap USD", "5"),
            EnvSpec("MERCY_MONTHLY_TENANT_COST_CAP_USD", "Monthly tenant cost cap USD", "100"),
            EnvSpec("MERCY_BETA_STRONG_MONTHLY_QUOTA", "Beta strong-model monthly quota", "50"),
            EnvSpec("MERCY_RATE_LIMIT_PER_MINUTE", "Rate limit per minute", "120"),
            EnvSpec("MERCY_MAX_UPLOAD_MB", "Max upload MB", "25"),
            EnvSpec("MERCY_MAX_CONTEXT_CHARS", "Max context chars", "120000"),
            EnvSpec("MERCY_ALERT_COST_SPIKE_USD", "Cost spike alert USD", "25"),
            EnvSpec("MERCY_ALERT_GUARDRAIL_FAILURES", "Guardrail failure alert count", "10"),
            EnvSpec("MERCY_ALERT_ERROR_RATE", "Error rate alert threshold", "0.10"),
            EnvSpec("MERCY_SEED_TENANT_ID", "Seed tenant ID", "public"),
            EnvSpec("MERCY_SEED_USER_ID", "Seed user ID", "dc-knowledge-seeder"),
            EnvSpec("MERCY_SEED_MIN_CHUNKS", "Minimum seed chunks", "500"),
            EnvSpec("MERCY_SEED_LLM_LIMIT", "Seed LLM limit", "20"),
            EnvSpec("MERCY_SEED_REPORT_PATH", "Seed report path", "reports/dc_knowledge_seed_latest.json"),
            EnvSpec("MERCY_RAGAS_REGRESSION_REPORT", "RAGAS regression report path"),
            EnvSpec("MERCY_ENABLE_REAL_LORA_TRAINING", "Enable real LoRA training", "false", choices=("true", "false")),
        ],
    ),
    (
        "Web / Office Surface",
        [
            EnvSpec("MERCY_CORE_API_URL", "Server-side core API URL", "http://127.0.0.1:8000"),
            EnvSpec("NEXT_PUBLIC_MERCY_CORE_API_URL", "Browser core API URL", "http://127.0.0.1:8000"),
            EnvSpec("NEXT_PUBLIC_MERCY_TENANT_ID", "Browser local tenant", "local-dev-tenant"),
            EnvSpec("NEXT_PUBLIC_MERCY_USER_ID", "Browser local user", "local-web-user"),
            EnvSpec("NEXT_PUBLIC_MERCY_API_TOKEN", "Browser local API token", secret=True),
            EnvSpec("NEXT_PUBLIC_SUPABASE_URL", "Browser Supabase URL"),
            EnvSpec("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Browser Supabase anon key", secret=True),
            EnvSpec("NEXT_PUBLIC_MERCY_OFFICE_PKCE_PROVIDER", "Browser Office PKCE provider"),
            EnvSpec("VITE_MERCY_CORE_API_URL", "Office add-in core API URL", "http://127.0.0.1:8000"),
            EnvSpec("VITE_MERCY_WEB_AUTH_URL", "Office add-in web auth URL", "https://127.0.0.1:3000"),
            EnvSpec("VITE_MERCY_OFFICE_PKCE_FALLBACK_ENABLED", "Office add-in PKCE fallback enabled", "true", choices=("true", "false")),
            EnvSpec("VITE_MERCY_API_TOKEN", "Office add-in local API token", secret=True),
            EnvSpec("VITE_MERCY_TENANT_ID", "Office add-in tenant", "local-dev-tenant"),
            EnvSpec("VITE_MERCY_USER_ID", "Office add-in user", "office-addin-user"),
        ],
    ),
]


def bootstrap_dependency(package: str, import_name: str, quiet: bool = False) -> bool:
    if importlib.util.find_spec(import_name):
        return True
    if not quiet:
        print(f"Installing missing dependency: {package}")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        return True
    except Exception as exc:
        if not quiet:
            print(f"Could not install {package}: {exc}")
        return False


def bootstrap_dependencies() -> bool:
    settings_ok = bootstrap_dependency("pydantic-settings", "pydantic_settings")
    bootstrap_dependency("rich", "rich", quiet=True)
    return settings_ok


def load_rich():
    try:
        from rich.console import Console
        from rich.panel import Panel
        from rich.prompt import Confirm, Prompt
        from rich.table import Table

        return Console, Panel, Prompt, Confirm, Table
    except Exception:
        return None, None, None, None, None


def parse_env(path: Path) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    unknown_lines: list[str] = []
    known = {spec.key for _, specs in GROUPS for spec in specs}
    if not path.exists():
        return values, unknown_lines
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        values[key] = value
        if key not in known:
            unknown_lines.append(line)
    return values, unknown_lines


def prompt_value(spec: EnvSpec, current: str, prompt_cls, confirm_cls) -> str:
    if spec.choices == ("true", "false"):
        default_bool = current.lower() in {"1", "true", "yes", "on"}
        return "true" if confirm_cls.ask(spec.label, default=default_bool) else "false"
    suffix = f" ({'/'.join(choice for choice in spec.choices if choice)})" if spec.choices else ""
    value = prompt_cls.ask(f"{spec.label}{suffix}", default=current or spec.default, password=spec.secret)
    if spec.choices and value and value not in spec.choices:
        print(f"Invalid choice '{value}', keeping {current or spec.default!r}.")
        return current or spec.default
    return value


def collect_values(existing: dict[str, str], *, non_interactive: bool) -> dict[str, str]:
    values = dict(existing)
    Console, Panel, Prompt, Confirm, _ = load_rich()
    use_rich = Console is not None and Prompt is not None and Confirm is not None
    console = Console() if Console else None

    if use_rich and not non_interactive:
        console.print(Panel.fit("Mercy Legal AI production setup", subtitle="PostgreSQL + pgvector primary"))
    elif not non_interactive:
        print("Mercy Legal AI production setup")

    for group, specs in GROUPS:
        if use_rich and not non_interactive:
            console.rule(group)
        elif not non_interactive:
            print(f"\n[{group}]")

        for spec in specs:
            current = values.get(spec.key, spec.default)
            if non_interactive:
                values.setdefault(spec.key, current)
                continue
            if use_rich:
                values[spec.key] = prompt_value(spec, current, Prompt, Confirm)
            else:
                display = "********" if spec.secret and current else current
                raw = input(f"{spec.label} [{display}]: ").strip()
                values[spec.key] = raw or current
    return values


def render_env(values: dict[str, str], unknown_lines: list[str]) -> str:
    lines = [
        "# Mercy Legal AI environment",
        "# Generated by scripts/setup_mercy.py. Keep secrets out of git.",
    ]
    for group, specs in GROUPS:
        lines.extend(["", f"# {group}"])
        for spec in specs:
            lines.append(f"{spec.key}={values.get(spec.key, spec.default)}")
    if unknown_lines:
        lines.extend(["", "# Existing custom variables preserved from previous .env"])
        lines.extend(unknown_lines)
    return "\n".join(lines).rstrip() + "\n"


def validate_config(strict: bool) -> tuple[bool, list[str], object | None]:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    try:
        from mercy_config import MercyConfig

        config = MercyConfig()
        return config.is_production_ready(strict=strict), config.readiness_issues(strict=strict), config
    except Exception as exc:
        return False, [f"Configuration could not be loaded: {exc}"], None


def print_readiness(ok: bool, issues: list[str], config: object | None) -> None:
    Console, Panel, _, _, Table = load_rich()
    if Console and Panel and Table:
        console = Console()
        if config is not None:
            table = Table(title="Mercy configuration")
            table.add_column("Field")
            table.add_column("Value")
            table.add_row("Environment", getattr(config, "mercy_env", "unknown"))
            table.add_row("Auth mode", getattr(config, "mercy_auth_mode", "unknown"))
            table.add_row("Database", "configured" if getattr(config, "database_url", None) else "missing")
            table.add_row("Hermes model", config.get_hermes_model() if hasattr(config, "get_hermes_model") else "unknown")
            table.add_row("Production ready", "yes" if ok else "no")
            console.print(table)
        if issues:
            console.print(Panel("\n".join(f"- {issue}" for issue in issues), title="Readiness issues", style="yellow"))
        else:
            console.print(Panel("Mercy configuration is production-ready.", style="green"))
    else:
        if config is not None:
            print(f"Environment: {getattr(config, 'mercy_env', 'unknown')}")
            print(f"Auth mode: {getattr(config, 'mercy_auth_mode', 'unknown')}")
            print(f"Database: {'configured' if getattr(config, 'database_url', None) else 'missing'}")
        if issues:
            print("Readiness issues:")
            for issue in issues:
                print(f"- {issue}")
        else:
            print("Mercy configuration is production-ready.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Configure Mercy Legal AI for local, staging, or production use.")
    parser.add_argument("--non-interactive", action="store_true", help="Write defaults/missing keys without prompts.")
    parser.add_argument("--strict", action="store_true", help="Treat the readiness check as production-like and fail on warnings.")
    parser.add_argument("--env-file", default=str(ENV_PATH), help="Path to .env file to create or update.")
    args = parser.parse_args(argv)

    if not bootstrap_dependencies():
        print("pydantic-settings is required. Install it with: pip install pydantic-settings")
        return 2

    env_path = Path(args.env_file).resolve()
    existing, unknown = parse_env(env_path if env_path.exists() else EXAMPLE_PATH)
    values = collect_values(existing, non_interactive=args.non_interactive)
    env_path.write_text(render_env(values, unknown), encoding="utf-8")
    print(f"Wrote {env_path}")

    ok, issues, config = validate_config(strict=args.strict)
    print_readiness(ok, issues, config)
    return 0 if ok or not args.strict else 1


if __name__ == "__main__":
    raise SystemExit(main())
