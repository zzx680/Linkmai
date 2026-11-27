-- Migration date: 2026-11-27

-- The landing contact form is written by the backend service role. Older
-- deployments may not have applied the original contact-messages migration;
-- create it idempotently and grant the writer the privileges it needs.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  subject text,
  message text not null,
  source text not null default 'landing',
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists idx_contact_messages_created_at
  on public.contact_messages(created_at desc);

alter table public.contact_messages enable row level security;
revoke all privileges on table public.contact_messages from anon, authenticated;
grant select, insert, update, delete on table public.contact_messages to service_role;

-- Invite codes for the closed beta. The plaintext code is shown once when an
-- administrator creates it; only its SHA-256 hash is stored here.
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  active boolean not null default true,
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint invite_codes_uses_within_limit check (uses <= max_uses)
);

create index if not exists idx_invite_codes_active_created_at
  on public.invite_codes(active, created_at desc);

alter table public.invite_codes enable row level security;

revoke all privileges on table public.invite_codes from anon, authenticated;
grant select, insert, update, delete on table public.invite_codes to service_role;

