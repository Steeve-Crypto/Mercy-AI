-- Mercy paid signup provisioning tables.
-- Apply manually with Supabase CLI or the Supabase SQL editor; the app must not mutate
-- this schema at startup.
--
-- Backend-only posture:
-- - Stripe webhook and provisioning routes use SUPABASE_SERVICE_ROLE_KEY server-side only.
-- - Row Level Security is enabled on all tables.
-- - Browser/authenticated access is limited to rows tied to auth.uid() membership.
-- - The service_role bypasses RLS for durable provisioning.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mercy_account_type') then
    create type mercy_account_type as enum ('solo', 'firm');
  end if;
  if not exists (select 1 from pg_type where typname = 'mercy_subscription_status') then
    create type mercy_subscription_status as enum ('pending', 'active', 'past_due', 'canceled', 'incomplete');
  end if;
  if not exists (select 1 from pg_type where typname = 'mercy_member_status') then
    create type mercy_member_status as enum ('active', 'disabled', 'pending');
  end if;
end $$;

create table if not exists public.mercy_tenants (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null unique,
  name text not null,
  workspace_name text not null,
  account_type mercy_account_type not null,
  subscription_status mercy_subscription_status not null default 'pending',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  attorney_seat_limit integer not null,
  practice_areas text not null default '',
  jurisdiction_focus text not null default '',
  created_by_user_id text,
  created_by_email text,
  firm_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_tenants_tenant_id_required check (length(trim(tenant_id)) > 0),
  constraint mercy_tenants_account_seat_limit check (
    (account_type = 'solo' and attorney_seat_limit = 1)
    or
    (account_type = 'firm' and attorney_seat_limit >= 2)
  )
);

create unique index if not exists mercy_tenants_stripe_subscription_unique
  on public.mercy_tenants (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists mercy_tenants_stripe_checkout_session_unique
  on public.mercy_tenants (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists mercy_tenants_stripe_customer_idx
  on public.mercy_tenants (stripe_customer_id);

create index if not exists mercy_tenants_subscription_status_idx
  on public.mercy_tenants (subscription_status);

create table if not exists public.mercy_firms (
  id uuid not null default gen_random_uuid(),
  firm_id text primary key,
  tenant_id text not null references public.mercy_tenants (tenant_id) on delete cascade,
  firm_name text not null,
  firm_domain text,
  attorney_seat_limit integer not null,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercy_firms_firm_id_required check (length(trim(firm_id)) > 0),
  constraint mercy_firms_tenant_id_required check (length(trim(tenant_id)) > 0),
  constraint mercy_firms_seat_limit_minimum check (attorney_seat_limit >= 2),
  constraint mercy_firms_one_per_tenant unique (tenant_id),
  constraint mercy_firms_id_unique unique (id)
);

create index if not exists mercy_firms_tenant_id_idx
  on public.mercy_firms (tenant_id);

create table if not exists public.mercy_tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mercy_tenants (tenant_id) on delete cascade,
  firm_id text references public.mercy_firms (firm_id) on delete set null,
  user_id text,
  supabase_user_id text generated always as (user_id) stored,
  email text,
  full_name text,
  roles text[] not null default '{}',
  status mercy_member_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint mercy_tenant_members_identity_required check (
    (user_id is not null and length(trim(user_id)) > 0)
    or
    (email is not null and length(trim(email)) > 0)
  ),
  constraint mercy_tenant_members_firm_role_shape check (
    firm_id is null or roles @> array['admin','firm_admin','attorney']::text[] or not (roles @> array['admin']::text[])
  ),
  constraint mercy_tenant_members_solo_admin_shape check (
    firm_id is not null or roles @> array['admin','attorney']::text[] or not (roles @> array['admin']::text[])
  )
);

create unique index if not exists mercy_tenant_members_tenant_user_unique
  on public.mercy_tenant_members (tenant_id, user_id)
  where user_id is not null;

create index if not exists mercy_tenant_members_email_idx
  on public.mercy_tenant_members (email);

create index if not exists mercy_tenant_members_tenant_id_idx
  on public.mercy_tenant_members (tenant_id);

create index if not exists mercy_tenant_members_firm_id_idx
  on public.mercy_tenant_members (firm_id);

alter table public.mercy_tenants enable row level security;
alter table public.mercy_firms enable row level security;
alter table public.mercy_tenant_members enable row level security;

revoke all on table public.mercy_tenants from anon;
revoke all on table public.mercy_firms from anon;
revoke all on table public.mercy_tenant_members from anon;
revoke all on table public.mercy_tenants from authenticated;
revoke all on table public.mercy_firms from authenticated;
revoke all on table public.mercy_tenant_members from authenticated;

grant select on table public.mercy_tenants to authenticated;
grant select on table public.mercy_firms to authenticated;
grant select on table public.mercy_tenant_members to authenticated;

drop policy if exists "Users can read their tenant memberships" on public.mercy_tenant_members;
create policy "Users can read their tenant memberships"
  on public.mercy_tenant_members
  for select
  to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists "Users can read their own tenants" on public.mercy_tenants;
create policy "Users can read their own tenants"
  on public.mercy_tenants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mercy_tenant_members member
      where member.tenant_id = mercy_tenants.tenant_id
        and member.user_id = auth.uid()::text
        and member.status = 'active'
    )
  );

drop policy if exists "Users can read their own firms" on public.mercy_firms;
create policy "Users can read their own firms"
  on public.mercy_firms
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mercy_tenant_members member
      where member.firm_id = mercy_firms.firm_id
        and member.user_id = auth.uid()::text
        and member.status = 'active'
    )
  );

comment on table public.mercy_tenants is
  'Mercy paid tenant provisioning state. Backend/service-role managed; browser reads are RLS-scoped to authenticated membership.';
comment on table public.mercy_firms is
  'Mercy firm profiles for paid firm tenants. Backend/service-role managed; browser reads are RLS-scoped to authenticated firm membership.';
comment on table public.mercy_tenant_members is
  'Mercy tenant memberships and roles. Backend/service-role managed; browser reads are limited to the current user membership.';
