# Mercy AI Beta Privacy Policy

Effective date: 2026-05-14

Mercy AI supports D.C. solo and small-firm attorneys with AI-assisted matter intake, research, drafting, template generation, and Office Add-in workflows. This beta privacy policy describes how Mercy AI handles information during the limited beta.

## Information We Process

Mercy AI may process:

- Account and beta invite information, including email address and practice area.
- Matter information entered by attorneys, including client names, facts, deadlines, documents, requested relief, and matter context.
- AI workflow metadata, including route/expert, confidence score, guardrail status, RAG status, citations, LangSmith trace IDs, and template usage.
- Feedback, thumbs up/down signals, optional comments, and basic usage metrics.
- Security audit records for sensitive actions such as matter access, document generation, RAG retrieval, LLM calls, quota checks, and data deletion.

## How We Use Information

Mercy AI uses information to:

- Provide tenant-scoped legal AI workflows.
- Generate AI-assisted drafts, research responses, templates, and matter summaries.
- Improve reliability signals, citation grounding, guardrails, and beta onboarding.
- Detect abuse, enforce quotas, investigate errors, and maintain security logs.
- Support legal, compliance, and SOC 2 readiness work.

## Attorney Responsibilities

Mercy AI is not a law firm and does not provide legal advice. Attorneys must review, verify, and approve all AI-assisted output before use. Attorneys remain responsible for client confidentiality, privilege, competence, supervision, fee reasonableness, citation verification, and compliance with the D.C. Rules of Professional Conduct.

## AI Providers and Subprocessors

When configured, Mercy AI may use LLM providers such as OpenAI, Anthropic, Groq, or other providers via LiteLLM. Provider use depends on the environment and configured API keys. Mercy AI applies sanitization and PII redaction hooks before LLM/RAG flows, but attorneys should avoid entering unnecessary sensitive data during beta.

## Retention and Deletion

Beta users may request deletion through the in-product “Delete all my data” capability. Mercy AI soft-deletes matter records and purges or deactivates tenant-scoped transient RAG/checkpoint records. Audit logs may be retained for security, abuse prevention, legal compliance, and incident investigation.

## Security

Mercy AI uses tenant isolation, audit logging, rate limiting, security headers, explicit CORS allow-listing, HTTPS enforcement support, and PostgreSQL persistent storage. Encryption at rest depends on the configured PostgreSQL/Supabase host and must be enabled in production.

## Contact

Questions about beta privacy, deletion, or security should be directed to the Mercy AI beta administrator.
