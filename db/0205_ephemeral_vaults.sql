-- 0205 — Zero-knowledge ephemeral handoff (AI → human).
-- An account-less AI agent (sandbox key) stores a workspace configuration in an
-- ephemeral vault: AES-256-GCM ciphertext under a one-time secret that only the
-- agent receives. The server keeps the ciphertext and an argon2id hash of a
-- one-way claim proof derived from that secret; never the secret, never plaintext.
-- The human decrypts in the browser, re-encrypts with their own Master Key and
-- commits: the workspace row then holds only client-side ciphertext and the
-- vault row is hard-deleted in the same transaction.
-- Idempotent; meant for manual execution in the Neon SQL editor as owner.

create table if not exists public.ephemeral_vaults (
  vault_id          uuid primary key,
  vault_hash        text not null,
  encrypted_payload text not null,
  sandbox_id        uuid not null references public.agent_sandboxes (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  constraint ephemeral_vaults_hash check (vault_hash ~ '^\$argon2id\$v=19\$m=[0-9]{1,6},t=[0-9]{1,2},p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$'),
  constraint ephemeral_vaults_payload check (
    char_length(encrypted_payload) <= 131072
    and encrypted_payload ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$'
  ),
  constraint ephemeral_vaults_max_1h check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);
create index if not exists ephemeral_vaults_expires_idx on public.ephemeral_vaults (expires_at);
create index if not exists ephemeral_vaults_sandbox_idx on public.ephemeral_vaults (sandbox_id);
revoke all on public.ephemeral_vaults from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.ephemeral_vaults from rout_app;
  end if;
end $$;
alter table public.ephemeral_vaults enable row level security;

-- Client-side E2EE storage on the main workspace table: ciphertext + the id of
-- the member's key that sealed it. The server cannot read either.
alter table public.workspaces add column if not exists encrypted_config text;
alter table public.workspaces add column if not exists encrypted_config_key_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_encrypted_config_check') then
    alter table public.workspaces add constraint workspaces_encrypted_config_check check (
      (encrypted_config is null and encrypted_config_key_id is null)
      or (
        char_length(encrypted_config) <= 131072
        and encrypted_config ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$'
        and encrypted_config_key_id ~ '^[A-Za-z0-9_-]{22}$'
      )
    );
  end if;
end $$;

-- Create: live sandbox only, at most 5 open vaults per sandbox, TTL fixed at 1 hour.
create or replace function public.rout_ephemeral_vault_create(
  p_vault_id uuid, p_key_hash text, p_vault_hash text, p_payload text
)
returns timestamptz
language plpgsql security definer set search_path to 'public'
as $$
declare v_sandbox uuid; v_open integer; v_now timestamptz := now();
begin
  select s.id into v_sandbox from public.agent_sandboxes s
   where s.key_hash = p_key_hash and s.revoked_at is null and s.expires_at > v_now;
  if v_sandbox is null then raise exception 'sandbox_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('ephemeral_vault:' || v_sandbox::text));
  delete from public.ephemeral_vaults v where v.expires_at <= v_now;
  select count(*) into v_open from public.ephemeral_vaults v where v.sandbox_id = v_sandbox;
  if v_open >= 5 then raise exception 'vault_quota_reached'; end if;
  insert into public.ephemeral_vaults (vault_id, vault_hash, encrypted_payload, sandbox_id, created_at, expires_at)
  values (p_vault_id, p_vault_hash, p_payload, v_sandbox, v_now, v_now + interval '1 hour');
  return v_now + interval '1 hour';
end; $$;

-- Read for a signed-in human. The hash is returned to the server layer only
-- (to verify the claim proof); the API never forwards it.
create or replace function public.rout_ephemeral_vault_read(p_vault_id uuid)
returns table(vault_hash text, encrypted_payload text, expires_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select v.vault_hash, v.encrypted_payload, v.expires_at
    from public.ephemeral_vaults v
   where public.rout_current_user_id() is not null
     and v.vault_id = p_vault_id and v.expires_at > now()
   limit 1
$$;

-- Commit: one transaction creates the E2EE workspace, makes the caller Owner
-- and hard-deletes the vault. p_vault_hash must equal the stored hash the
-- server just verified the proof against, so a vault cannot change in between.
create or replace function public.rout_ephemeral_vault_commit(
  p_vault_id uuid, p_vault_hash text, p_name text, p_slug text, p_blob text, p_key_id text
)
returns table(workspace_id uuid, slug text)
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := public.rout_current_user_id(); v_vault public.ephemeral_vaults%rowtype; v_ws uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_vault from public.ephemeral_vaults v where v.vault_id = p_vault_id for update;
  if not found then raise exception 'vault_not_found'; end if;
  if v_vault.expires_at <= now() then raise exception 'vault_expired'; end if;
  if v_vault.vault_hash <> p_vault_hash then raise exception 'vault_proof_invalid'; end if;
  if exists (select 1 from public.workspaces w where w.slug = lower(p_slug)) then raise exception 'slug_taken'; end if;

  insert into public.workspaces (name, slug, plan, encrypted_config, encrypted_config_key_id)
  values (p_name, lower(p_slug), 'free', p_blob, p_key_id)
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_uid, 'owner');
  delete from public.ephemeral_vaults v where v.vault_id = p_vault_id;
  return query select v_ws, lower(p_slug);
end; $$;

-- Cleanup (cron): hard-delete every expired vault.
create or replace function public.rout_purge_expired_ephemeral_vaults()
returns integer
language sql security definer set search_path to 'public'
as $$
  with d as (delete from public.ephemeral_vaults v where v.expires_at <= now() returning 1)
  select count(*)::integer from d
$$;

revoke all on function public.rout_ephemeral_vault_create(uuid, text, text, text) from public;
revoke all on function public.rout_ephemeral_vault_read(uuid) from public;
revoke all on function public.rout_ephemeral_vault_commit(uuid, text, text, text, text, text) from public;
revoke all on function public.rout_purge_expired_ephemeral_vaults() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_ephemeral_vault_create(uuid, text, text, text) to rout_app;
    grant execute on function public.rout_ephemeral_vault_read(uuid) to rout_app;
    grant execute on function public.rout_ephemeral_vault_commit(uuid, text, text, text, text, text) to rout_app;
    grant execute on function public.rout_purge_expired_ephemeral_vaults() to rout_app;
  end if;
end $$;
