-- Mercy persistent work history and saved outputs.
-- Apply manually with Supabase CLI or the Supabase SQL editor; the app must not
-- mutate this schema at startup.
--
-- Storage posture:
-- - Postgres is the durable tenant-scoped product history store.
-- - Writes are performed by server routes using SUPABASE_SERVICE_ROLE_KEY.
-- - Browser clients never receive or use the service role key.
-- - RLS is enabled; direct authenticated reads are scoped to the current user
--   and tenant. Anon access is revoked.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mercy_history_context_type') then
    create type mercy_history_context_type as enum (
      'general',
      'matter',
      'document',
      'research',
      'drafting',
      'review',
      'citation_check',
      'office'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'mercy_history_workflow_type') then
    create type mercy_history_workflow_type as enum (
      'general',
      'drafting',
      'review',
      'research',
      'citation_check',
      'document_review',
      'intake',
      'template',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'mercy_history_status') then
    create type mercy_history_status as enum ('completed', 'failed', 'saved', 'archived');
  end if;
end $$;

create table if not exists public.mercy_work_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  firm_id text,
  user_id text not null,
  user_email text,
  matter_id text,
  document_id text,
  thread_id text,
  session_id text,
  source_type mercy_history_context_type not null default 'general',
  context_type mercy_history_context_type generated always as (source_type) stored,
  workflow_type mercy_history_workflow_type not null default 'general',
  title text not null,
  input_summary text,
  request_text text,
  output_summary text,
  output_text text,
  status mercy_history_status not null default 'completed',
  reliability_snapshot jsonb not null default '{}'::jsonb,
  citations_snapshot jsonb not null default '[]'::jsonb,
  retrieval_run_id text,
  reliability_snapshot_id text,
  missing_inputs jsonb not null default '[]'::jsonb,
  trace_id text,
  langsmith_url text,
  hermes_memory_ref text,
  moe_route jsonb,
  expert_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  saved_at timestamptz,
  archived_at timestamptz,
  constraint mercy_work_history_tenant_required check (length(trim(tenant_id)) > 0),
  constraint mercy_work_history_user_required check (length(trim(user_id)) > 0),
  constraint mercy_work_history_title_required check (length(trim(title)) > 0)
);

create index if not exists mercy_work_history_tenant_idx
  on public.mercy_work_history (tenant_id);
create index if not exists mercy_work_history_user_idx
  on public.mercy_work_history (user_id);
create index if not exists mercy_work_history_matter_idx
  on public.mercy_work_history (matter_id)
  where matter_id is not null;
create index if not exists mercy_work_history_document_idx
  on public.mercy_work_history (document_id)
  where document_id is not null;
create index if not exists mercy_work_history_workflow_idx
  on public.mercy_work_history (workflow_type);
create index if not exists mercy_work_history_created_idx
  on public.mercy_work_history (created_at desc);
create index if not exists mercy_work_history_thread_idx
  on public.mercy_work_history (thread_id)
  where thread_id is not null;
create index if not exists mercy_work_history_saved_idx
  on public.mercy_work_history (tenant_id, user_id, saved_at desc)
  where saved_at is not null and status = 'saved';
create index if not exists mercy_work_history_retrieval_idx
  on public.mercy_work_history (retrieval_run_id)
  where retrieval_run_id is not null;
create index if not exists mercy_work_history_reliability_idx
  on public.mercy_work_history (reliability_snapshot_id)
  where reliability_snapshot_id is not null;

alter table public.mercy_work_history enable row level security;

revoke all on table public.mercy_work_history from anon;
revoke all on table public.mercy_work_history from authenticated;
grant select on table public.mercy_work_history to authenticated;

drop policy if exists "Users can read own tenant work history" on public.mercy_work_history;
create policy "Users can read own tenant work history"
  on public.mercy_work_history
  for select
  to authenticated
  using (
    user_id = auth.uid()::text
    and tenant_id = coalesce(
      nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'tenant_id', ''),
      auth.uid()::text
    )
  );

comment on table public.mercy_work_history is
  'Tenant-scoped durable Mercy product work history and saved outputs. Backend/service-role managed; browser reads are RLS-scoped.';
