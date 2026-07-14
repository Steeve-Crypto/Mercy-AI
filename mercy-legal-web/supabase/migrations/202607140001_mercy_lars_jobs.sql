-- Mercy LARS durable job store for hosted PostgreSQL / Supabase.
-- Production-safe: creates table and indexes only if missing.
-- Payload remains JSONB for the existing ResearchJob document model.

CREATE TABLE IF NOT EXISTS mercy_lars_jobs (
    job_id VARCHAR(128) PRIMARY KEY,
    tenant_id VARCHAR(128) NOT NULL,
    firm_id VARCHAR(128),
    user_id VARCHAR(128) NOT NULL,
    matter_id VARCHAR(128),
    status VARCHAR(64) NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_tenant ON mercy_lars_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_status ON mercy_lars_jobs (status);
CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_tenant_updated ON mercy_lars_jobs (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_matter ON mercy_lars_jobs (tenant_id, matter_id);

COMMENT ON TABLE mercy_lars_jobs IS 'Durable Mercy LARS / ALTS-MoE research jobs (tenant-isolated JSON payloads).';
