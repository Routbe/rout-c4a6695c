-- 0209 — Social/device recovery vault (Shamir 3-of-5) and blind pairwise subjects.
--
-- recovery_vaults: per member one active vault. sealed_master is AES-256-GCM
-- ciphertext of the Master Key under a vault key that exists only as 5 shards
-- held by the member; commitments are SHA-256 hashes per shard so forged shards
-- are named client-side. The server never sees a shard in plaintext.
-- recovery_sealed_shards: at most 2 server-held shards per vault (passkey-
-- wrapped), enforced here, so the server can never reach the threshold of 3.
-- recovery_attempts: rate limit + notification trail.
-- pairwise_subjects: partner-facing subject, hashed sector, public key. There
-- is deliberately NO account column: the link exists only during a sign-in.
-- Tables are private; the app role gets only the functions below.
-- Idempotent; run as owner.

create table if not exists public.recovery_vaults (
  user_id       uuid primary key references public.users (id) on delete cascade,
  vault_id      text not null unique,
  version       smallint not null,
  threshold     smallint not null,
  sealed_master text not null,
  commitments   jsonb not null,
  created_at    timestamptz not null default now(),
  constraint recovery_vaults_id check (vault_id ~ '^[0-9a-f]{32}$'),
  constraint recovery_vaults_shape check (version = 1 and threshold = 3 and jsonb_typeof(commitments) = 'array' and jsonb_array_length(commitments) = 5),
  constraint recovery_vaults_sealed check (sealed_master ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,200}$')
);

create table if not exists public.recovery_sealed_shards (
  vault_id    text not null references public.recovery_vaults (vault_id) on delete cascade,
  shard_index smallint not null check (shard_index between 1 and 5),
  slot        text not null check (slot in ('passkey')),
  credential  text not null check (char_length(credential) between 8 and 1400),
  ciphertext  text not null check (ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,400}$'),
  created_at  timestamptz not null default now(),
  primary key (vault_id, shard_index)
);

create table if not exists public.recovery_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  outcome    text not null check (outcome in ('started', 'restored', 'failed', 'practice', 'rotated', 'created')),
  created_at timestamptz not null default now()
);
create index if not exists recovery_attempts_user_idx on public.recovery_attempts (user_id, created_at desc);

create table if not exists public.pairwise_subjects (
  sub         text primary key check (sub ~ '^[A-Za-z0-9_-]{43}$'),
  sector_hash text not null check (sector_hash ~ '^[0-9a-f]{64}$'),
  public_key  text not null check (public_key ~ '^[A-Za-z0-9_-]{43}$'),
  created_at  timestamptz not null default now()
);

revoke all on public.recovery_vaults, public.recovery_sealed_shards, public.recovery_attempts, public.pairwise_subjects from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.recovery_vaults, public.recovery_sealed_shards, public.recovery_attempts, public.pairwise_subjects from rout_app;
  end if;
end $$;
alter table public.recovery_vaults enable row level security;
alter table public.recovery_sealed_shards enable row level security;
alter table public.recovery_attempts enable row level security;
alter table public.pairwise_subjects enable row level security;

-- Hard ceiling: never 3 or more server-held shards for one vault.
create or replace function public.rout_recovery_shard_ceiling() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  perform 1 from public.recovery_vaults where vault_id = new.vault_id for update;
  if (select count(*) from public.recovery_sealed_shards where vault_id = new.vault_id and shard_index <> new.shard_index) >= 2 then
    raise exception 'recovery_server_shard_ceiling' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists recovery_shard_ceiling on public.recovery_sealed_shards;
create trigger recovery_shard_ceiling before insert or update on public.recovery_sealed_shards
  for each row execute function public.rout_recovery_shard_ceiling();

-- Create or rotate: replacing the vault cascades away every old server-held shard.
create or replace function public.rout_recovery_vault_put(p_user uuid, p_vault_id text, p_sealed text, p_commitments jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_rotated boolean;
begin
  v_rotated := exists (select 1 from public.recovery_vaults where user_id = p_user);
  delete from public.recovery_vaults where user_id = p_user;
  insert into public.recovery_vaults (user_id, vault_id, version, threshold, sealed_master, commitments)
  values (p_user, p_vault_id, 1, 3, p_sealed, p_commitments);
  insert into public.recovery_attempts (user_id, outcome) values (p_user, case when v_rotated then 'rotated' else 'created' end);
end $$;

create or replace function public.rout_recovery_vault_get(p_user uuid)
returns table (vault_id text, version smallint, threshold smallint, sealed_master text, commitments jsonb, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select vault_id, version, threshold, sealed_master, commitments, created_at from public.recovery_vaults where user_id = p_user
$$;

create or replace function public.rout_recovery_vault_delete(p_user uuid)
returns void language sql security definer set search_path to 'public' as $$
  delete from public.recovery_vaults where user_id = p_user
$$;

create or replace function public.rout_recovery_shard_put(p_user uuid, p_vault_id text, p_index smallint, p_credential text, p_ciphertext text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from public.recovery_vaults where user_id = p_user and vault_id = p_vault_id) then
    raise exception 'recovery_vault_mismatch' using errcode = 'check_violation';
  end if;
  insert into public.recovery_sealed_shards (vault_id, shard_index, slot, credential, ciphertext)
  values (p_vault_id, p_index, 'passkey', p_credential, p_ciphertext)
  on conflict (vault_id, shard_index) do update set credential = excluded.credential, ciphertext = excluded.ciphertext, created_at = now();
end $$;

create or replace function public.rout_recovery_shards_get(p_user uuid)
returns table (shard_index smallint, credential text, ciphertext text)
language sql stable security definer set search_path to 'public' as $$
  select s.shard_index, s.credential, s.ciphertext from public.recovery_sealed_shards s
  join public.recovery_vaults v on v.vault_id = s.vault_id where v.user_id = p_user order by s.shard_index
$$;

create or replace function public.rout_recovery_attempt(p_user uuid, p_outcome text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_recent integer;
begin
  select count(*) into v_recent from public.recovery_attempts
   where user_id = p_user and outcome in ('started', 'failed', 'practice') and created_at > now() - interval '1 hour';
  insert into public.recovery_attempts (user_id, outcome) values (p_user, p_outcome);
  return v_recent;
end $$;

create or replace function public.rout_recovery_attempts_list(p_user uuid)
returns table (outcome text, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select outcome, created_at from public.recovery_attempts where user_id = p_user order by created_at desc limit 20
$$;

-- Pairwise: first registration wins; a subject can never move to another key or sector.
create or replace function public.rout_pairwise_register(p_sub text, p_sector_hash text, p_public_key text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.pairwise_subjects (sub, sector_hash, public_key) values (p_sub, p_sector_hash, p_public_key)
  on conflict (sub) do nothing;
  return exists (select 1 from public.pairwise_subjects where sub = p_sub and sector_hash = p_sector_hash and public_key = p_public_key);
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_recovery_vault_put(uuid, text, text, jsonb) to rout_app;
    grant execute on function public.rout_recovery_vault_get(uuid) to rout_app;
    grant execute on function public.rout_recovery_vault_delete(uuid) to rout_app;
    grant execute on function public.rout_recovery_shard_put(uuid, text, smallint, text, text) to rout_app;
    grant execute on function public.rout_recovery_shards_get(uuid) to rout_app;
    grant execute on function public.rout_recovery_attempt(uuid, text) to rout_app;
    grant execute on function public.rout_recovery_attempts_list(uuid) to rout_app;
    grant execute on function public.rout_pairwise_register(text, text, text) to rout_app;
  end if;
end $$;
revoke execute on function public.rout_recovery_vault_put(uuid, text, text, jsonb), public.rout_recovery_vault_get(uuid),
  public.rout_recovery_vault_delete(uuid), public.rout_recovery_shard_put(uuid, text, smallint, text, text),
  public.rout_recovery_shards_get(uuid), public.rout_recovery_attempt(uuid, text), public.rout_recovery_attempts_list(uuid),
  public.rout_pairwise_register(text, text, text) from public;
