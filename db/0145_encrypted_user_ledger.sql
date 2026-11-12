-- New migration: 0140-0144 are immutable. Apply only to ROUT's existing Neon database.
create table if not exists public.user_ledger_keys (
  user_id uuid not null references public.users(id) on delete cascade,
  key_id text not null,
  ledger_public_key jsonb not null,
  encrypted_ledger_private_key jsonb not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (user_id, key_id)
);
grant select, insert, update on public.user_ledger_keys to rout_app;
alter table public.user_ledger_keys enable row level security;
create policy ledger_keys_owner on public.user_ledger_keys
  using (user_id = public.rout_current_user_id()) with check (user_id = public.rout_current_user_id());
create unique index if not exists ledger_one_active_key on public.user_ledger_keys(user_id) where retired_at is null;

create table if not exists public.user_encrypted_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  key_id text not null,
  encrypted_payload text not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, key_id) references public.user_ledger_keys(user_id, key_id) on delete cascade
);
grant select, insert on public.user_encrypted_audit_logs to rout_app;
alter table public.user_encrypted_audit_logs enable row level security;
create policy encrypted_ledger_owner on public.user_encrypted_audit_logs
  using (user_id = public.rout_current_user_id()) with check (user_id = public.rout_current_user_id());
create index if not exists encrypted_ledger_user_cursor on public.user_encrypted_audit_logs(user_id, created_at desc, id desc);
-- Envelope JSON must not contain an exported plaintext private JWK.
alter table public.user_ledger_keys add constraint ledger_public_only check (
  ledger_public_key->>'kty' = 'RSA' and not (ledger_public_key ? 'd') and not (ledger_public_key ? 'p')
);