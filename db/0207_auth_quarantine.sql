-- 0207 — Passkey-only cutover: legacy-account quarantine and out-of-band recovery.
-- A member WITHOUT a passkey is quarantined by definition (no session is honoured).
-- To get out, they file a recovery request; an admin verifies their identity
-- out-of-band and approves it, which yields a single-use binding token (only its
-- SHA-256 is stored, 24 h). With that token the member registers a first passkey.
-- Idempotent; run as owner.

create table if not exists public.auth_recovery_requests (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    text not null,
  email           text not null,
  note            text check (note is null or char_length(note) <= 1000),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'bound', 'expired')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid,
  decision_note   text check (decision_note is null or char_length(decision_note) <= 1000),
  token_hash      text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  bound_at        timestamptz,
  constraint auth_recovery_token_when_approved check (status <> 'approved' or (token_hash is not null and token_expires_at is not null))
);
create index if not exists auth_recovery_requests_status_idx on public.auth_recovery_requests (status, created_at desc);
-- One open request per account at a time.
create unique index if not exists auth_recovery_requests_open_uidx on public.auth_recovery_requests (auth_user_id) where status in ('pending', 'approved');
revoke all on public.auth_recovery_requests from public;
alter table public.auth_recovery_requests enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update on public.auth_recovery_requests to rout_app;
  end if;
end $$;
