-- 0158: identity relay merge support + least-privilege runtime role.
-- Apply after 0152 and 0157. Idempotent; aborts (whole file) when rout_app is unsafe.

-- 1. Archive for duplicate relays dropped by an account merge (primary keeps its own).
create table if not exists public.identity_relay_merge_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  merged_from_user_id uuid not null,
  connected_app_id text not null,
  proxy_email text not null,
  target_email text not null,
  status text not null,
  relay_created_at timestamptz not null,
  archived_at timestamptz not null default now()
);
create index if not exists identity_relay_merge_archive_user on public.identity_relay_merge_archive (user_id, archived_at desc);

alter table public.identity_relay_merge_archive enable row level security;
drop policy if exists rout_scope on public.identity_relay_merge_archive;
create policy rout_scope on public.identity_relay_merge_archive for select
  using (user_id = public.rout_current_user_id());

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    -- Read-only for members: archives are written by the merge capability only.
    grant select on public.identity_relay_merge_archive to rout_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'rout_merge_executor') then
    grant select, update, delete on public.identity_relays to rout_merge_executor;
    grant select, insert, update on public.identity_relay_merge_archive to rout_merge_executor;
    grant insert on public.notifications to rout_merge_executor;
    drop policy if exists atomic_merge_executor on public.identity_relays;
    create policy atomic_merge_executor on public.identity_relays to rout_merge_executor using (true) with check (true);
    drop policy if exists atomic_merge_executor on public.identity_relay_merge_archive;
    create policy atomic_merge_executor on public.identity_relay_merge_archive to rout_merge_executor using (true) with check (true);
  end if;
end $$;

-- 2. rout_app = data only: SELECT/INSERT/UPDATE/DELETE, never schema or bulk power.
do $$
declare r record;
begin
  if not exists (select 1 from pg_roles where rolname = 'rout_app') then return; end if;

  -- Fail closed: the runtime role must never be privileged or own anything.
  if exists (select 1 from pg_roles where rolname = 'rout_app'
             and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication)) then
    raise exception 'rout_app has elevated attributes; fix the role before applying 0158';
  end if;
  if exists (select 1 from pg_class c join pg_roles o on o.oid = c.relowner
             where o.rolname = 'rout_app' and c.relnamespace in ('public'::regnamespace, 'neon_auth'::regnamespace)) then
    raise exception 'rout_app owns relations; ownership allows ALTER/DROP';
  end if;

  -- No TRUNCATE, REFERENCES or TRIGGER on any table, in any app schema.
  for r in select n.nspname from pg_namespace n where n.nspname in ('public', 'neon_auth') loop
    execute format('revoke truncate, references, trigger on all tables in schema %I from rout_app', r.nspname);
    execute format('revoke create on schema %I from rout_app', r.nspname);
    execute format('alter default privileges in schema %I revoke truncate, references, trigger on tables from rout_app', r.nspname);
  end loop;

  -- No new objects anywhere: schema CREATE is closed for PUBLIC too, and the
  -- database-level CREATE/TEMPORARY rights are withdrawn from the runtime.
  revoke create on schema public from public;
  execute format('revoke create, temporary on database %I from rout_app', current_database());
  execute format('revoke temporary on database %I from public', current_database());
end $$;
