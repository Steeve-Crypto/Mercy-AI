-- Mercy PostgreSQL + pgvector storage foundation.
-- Apply manually with Supabase CLI or the Supabase SQL editor; the app must not
-- mutate production schema at startup.
--
-- Storage posture:
-- - Public D.C. legal source chunks are shared/global.
-- - Tenant documents and document chunks are private tenant/workspace data.
-- - Service-role/backend writes are expected for ingestion, extraction,
--   embeddings, retrieval runs, and reliability snapshots.

create extension if not exists pgcrypto;
create extension if not exists vector;

alter table if exists public.mercy_tenants
  add column if not exists parent_firm_id text;

update public.mercy_tenants
set parent_firm_id = firm_id
where parent_firm_id is null
  and firm_id is not null;

create index if not exists mercy_tenants_parent_firm_idx
  on public.mercy_tenants (parent_firm_id)
  where parent_firm_id is not null;

create index if not exists mercy_tenants_firm_workspace_idx
  on public.mercy_tenants (firm_id, tenant_id)
  where firm_id is not null;

create index if not exists mercy_tenants_parent_workspace_idx
  on public.mercy_tenants (parent_firm_id, tenant_id)
  where parent_firm_id is not null;

comment on column public.mercy_tenants.parent_firm_id is
  'Optional parent firm/account boundary for small-firm accounts that own multiple child tenant/workspace scopes.';

comment on column public.mercy_tenants.firm_id is
  'Compatibility firm/account boundary for existing signup and metadata flows. New firm-scoped storage should also populate parent_firm_id.';

comment on table public.mercy_firms is
  'Mercy firm/account profiles. tenant_id is the firm home workspace for compatibility; additional child tenant/workspace scopes link through mercy_tenants.parent_firm_id.';

do $$
begin
  if to_regclass('public.mercy_dc_chunks') is not null then
    alter table public.mercy_dc_chunks
      add column if not exists embedding_vector vector(384);

    create index if not exists mercy_dc_chunks_embedding_hnsw_idx
      on public.mercy_dc_chunks
      using hnsw (embedding_vector vector_cosine_ops)
      where embedding_vector is not null;
  end if;
end $$;

create table if not exists public.mercy_legal_sources (
  source_id text primary key,
  title text not null,
  source_type text not null,
  authority_type text not null,
  jurisdiction text not null,
  citation_label text not null,
  official_locator text not null,
  url text,
  file_anchor text,
  last_checked text not null,
  verification_status text not null,
  refresh_cadence text not null,
  local_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_legal_sources_jurisdiction_check check (jurisdiction = 'District of Columbia'),
  constraint mercy_legal_sources_locator_required check (length(trim(official_locator)) > 0)
);

create index if not exists mercy_legal_sources_jurisdiction_idx
  on public.mercy_legal_sources (jurisdiction);
create index if not exists mercy_legal_sources_authority_idx
  on public.mercy_legal_sources (authority_type);
create index if not exists mercy_legal_sources_active_idx
  on public.mercy_legal_sources (active);

create table if not exists public.mercy_legal_source_chunks (
  chunk_id text primary key,
  source_id text not null references public.mercy_legal_sources (source_id) on delete cascade,
  text text not null,
  summary text not null,
  source_title text not null,
  citation_label text not null,
  source_type text not null,
  authority_type text not null,
  jurisdiction text not null,
  official_locator text not null,
  url text,
  entities jsonb not null default '[]'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  verification_status text not null,
  citation_required boolean not null default true,
  last_checked text not null,
  practice_area text not null,
  source_date text,
  embedding_model text not null default 'mercy-hash-embedding-384',
  embedding_vector vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_legal_source_chunks_jurisdiction_check check (jurisdiction = 'District of Columbia')
);

create index if not exists mercy_legal_source_chunks_source_idx
  on public.mercy_legal_source_chunks (source_id);
create index if not exists mercy_legal_source_chunks_filter_idx
  on public.mercy_legal_source_chunks (jurisdiction, practice_area, authority_type);
create index if not exists mercy_legal_source_chunks_embedding_hnsw_idx
  on public.mercy_legal_source_chunks
  using hnsw (embedding_vector vector_cosine_ops)
  where embedding_vector is not null;

create table if not exists public.mercy_documents (
  document_id text primary key,
  tenant_id text not null,
  firm_id text,
  matter_id text,
  uploaded_by_user_id text not null,
  filename text not null,
  mime_type text not null,
  storage_provider text not null default 'local_upload_dir',
  storage_key text not null,
  sha256 text not null,
  size_bytes integer not null default 0,
  status text not null default 'uploaded',
  extraction_status text not null default 'uploaded',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_documents_tenant_required check (length(trim(tenant_id)) > 0),
  constraint mercy_documents_user_required check (length(trim(uploaded_by_user_id)) > 0),
  constraint mercy_documents_status_check check (status in ('uploaded', 'extracting', 'ready', 'extraction_limited', 'failed', 'deleted')),
  constraint mercy_documents_extraction_status_check check (extraction_status in ('uploaded', 'extracting', 'ready', 'extraction_limited', 'failed'))
);

create index if not exists mercy_documents_tenant_idx
  on public.mercy_documents (tenant_id);
create index if not exists mercy_documents_firm_idx
  on public.mercy_documents (firm_id)
  where firm_id is not null;
create index if not exists mercy_documents_tenant_matter_idx
  on public.mercy_documents (tenant_id, matter_id)
  where matter_id is not null;
create index if not exists mercy_documents_sha_idx
  on public.mercy_documents (sha256);

create table if not exists public.mercy_document_chunks (
  chunk_id text primary key,
  tenant_id text not null,
  firm_id text,
  matter_id text,
  document_id text not null references public.mercy_documents (document_id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  summary text,
  token_count integer not null default 0,
  embedding_model text not null default 'mercy-hash-embedding-384',
  embedding_vector vector(384),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_document_chunks_tenant_required check (length(trim(tenant_id)) > 0),
  constraint mercy_document_chunks_index_nonnegative check (chunk_index >= 0)
);

create unique index if not exists mercy_document_chunks_document_index_unique
  on public.mercy_document_chunks (document_id, chunk_index);
create index if not exists mercy_document_chunks_tenant_document_idx
  on public.mercy_document_chunks (tenant_id, document_id);
create index if not exists mercy_document_chunks_tenant_matter_idx
  on public.mercy_document_chunks (tenant_id, matter_id)
  where matter_id is not null;
create index if not exists mercy_document_chunks_embedding_hnsw_idx
  on public.mercy_document_chunks
  using hnsw (embedding_vector vector_cosine_ops)
  where embedding_vector is not null;

create table if not exists public.mercy_embedding_jobs (
  job_id text primary key,
  tenant_id text,
  firm_id text,
  target_type text not null,
  target_id text not null,
  status text not null default 'queued',
  embedding_model text not null default 'mercy-hash-embedding-384',
  dimensions integer not null default 384,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_embedding_jobs_target_type_check check (target_type in ('document', 'document_chunk', 'legal_source', 'legal_source_chunk')),
  constraint mercy_embedding_jobs_status_check check (status in ('queued', 'running', 'completed', 'failed', 'skipped'))
);

create index if not exists mercy_embedding_jobs_status_idx
  on public.mercy_embedding_jobs (status, created_at);
create index if not exists mercy_embedding_jobs_tenant_target_idx
  on public.mercy_embedding_jobs (tenant_id, target_type, target_id);

create table if not exists public.mercy_retrieval_runs (
  retrieval_run_id text primary key,
  tenant_id text not null,
  firm_id text,
  user_id text not null,
  matter_id text,
  document_id text,
  query_hash text not null,
  source_scope text not null,
  filters_json jsonb not null default '{}'::jsonb,
  result_refs_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint mercy_retrieval_runs_tenant_required check (length(trim(tenant_id)) > 0),
  constraint mercy_retrieval_runs_user_required check (length(trim(user_id)) > 0),
  constraint mercy_retrieval_runs_scope_check check (source_scope in ('public_dc_sources', 'tenant_documents', 'mixed'))
);

create index if not exists mercy_retrieval_runs_tenant_created_idx
  on public.mercy_retrieval_runs (tenant_id, created_at desc);
create index if not exists mercy_retrieval_runs_tenant_matter_idx
  on public.mercy_retrieval_runs (tenant_id, matter_id)
  where matter_id is not null;

create table if not exists public.mercy_reliability_snapshots (
  snapshot_id text primary key,
  tenant_id text not null,
  firm_id text,
  user_id text not null,
  matter_id text,
  document_id text,
  retrieval_run_id text references public.mercy_retrieval_runs (retrieval_run_id) on delete set null,
  work_history_id uuid,
  confidence_score numeric,
  guardrail_status text not null default 'warn',
  attorney_review_required boolean not null default true,
  citations_json jsonb not null default '[]'::jsonb,
  reliability_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mercy_reliability_snapshots_tenant_required check (length(trim(tenant_id)) > 0),
  constraint mercy_reliability_snapshots_user_required check (length(trim(user_id)) > 0)
);

create index if not exists mercy_reliability_snapshots_tenant_created_idx
  on public.mercy_reliability_snapshots (tenant_id, created_at desc);
create index if not exists mercy_reliability_snapshots_retrieval_idx
  on public.mercy_reliability_snapshots (retrieval_run_id)
  where retrieval_run_id is not null;

alter table if exists public.mercy_work_history
  add column if not exists retrieval_run_id text;

alter table if exists public.mercy_work_history
  add column if not exists reliability_snapshot_id text;

create index if not exists mercy_work_history_retrieval_idx
  on public.mercy_work_history (retrieval_run_id)
  where retrieval_run_id is not null;

create index if not exists mercy_work_history_reliability_idx
  on public.mercy_work_history (reliability_snapshot_id)
  where reliability_snapshot_id is not null;

do $$
begin
  if to_regclass('public.mercy_work_history') is not null
    and not exists (
      select 1 from pg_constraint where conname = 'mercy_work_history_retrieval_fk'
    )
  then
    alter table public.mercy_work_history
      add constraint mercy_work_history_retrieval_fk
      foreign key (retrieval_run_id)
      references public.mercy_retrieval_runs (retrieval_run_id)
      on delete set null;
  end if;

  if to_regclass('public.mercy_work_history') is not null
    and not exists (
      select 1 from pg_constraint where conname = 'mercy_work_history_reliability_fk'
    )
  then
    alter table public.mercy_work_history
      add constraint mercy_work_history_reliability_fk
      foreign key (reliability_snapshot_id)
      references public.mercy_reliability_snapshots (snapshot_id)
      on delete set null;
  end if;

  if to_regclass('public.mercy_work_history') is not null
    and not exists (
      select 1 from pg_constraint where conname = 'mercy_reliability_snapshots_work_history_fk'
    )
  then
    alter table public.mercy_reliability_snapshots
      add constraint mercy_reliability_snapshots_work_history_fk
      foreign key (work_history_id)
      references public.mercy_work_history (id)
      on delete set null;
  end if;
end $$;

alter table public.mercy_documents enable row level security;
alter table public.mercy_document_chunks enable row level security;
alter table public.mercy_embedding_jobs enable row level security;
alter table public.mercy_retrieval_runs enable row level security;
alter table public.mercy_reliability_snapshots enable row level security;
alter table public.mercy_legal_sources enable row level security;
alter table public.mercy_legal_source_chunks enable row level security;

revoke all on table public.mercy_documents from anon;
revoke all on table public.mercy_document_chunks from anon;
revoke all on table public.mercy_embedding_jobs from anon;
revoke all on table public.mercy_retrieval_runs from anon;
revoke all on table public.mercy_reliability_snapshots from anon;
revoke all on table public.mercy_legal_sources from anon;
revoke all on table public.mercy_legal_source_chunks from anon;

comment on table public.mercy_documents is
  'Tenant-scoped Vault document metadata. Backend/service-role managed; document bytes live in the configured storage provider.';
comment on table public.mercy_legal_sources is
  'Shared public D.C. legal source registry. Separated from tenant-private documents; backend/admin managed.';
comment on table public.mercy_legal_source_chunks is
  'Shared public D.C. legal source chunks with pgvector embeddings. Separated from tenant-private document chunks.';
comment on table public.mercy_document_chunks is
  'Tenant-scoped private document chunks with pgvector embeddings for matter/document retrieval.';
comment on table public.mercy_embedding_jobs is
  'Backend embedding job status for tenant documents and public legal source chunks.';
comment on table public.mercy_retrieval_runs is
  'Safe retrieval metadata and result references; does not require storing raw queries.';
comment on table public.mercy_reliability_snapshots is
  'Durable citation, confidence, guardrail, and attorney-review snapshots for Mercy outputs.';
