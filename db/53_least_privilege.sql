-- 53 — Least privilege: drop Supabase stand-in roles, create runtime role `rout_app`.
--
-- Run as the database owner (MIGRATION_URL), never as rout_app. Idempotent.
-- Older migrations (00_compat, 21, 22, 28, ...) still create/grant to anon,
-- authenticated and service_role so a fresh database can be built from zero;
-- this file always removes them again at the end of the chain.
--
-- Access control lives server-side in the app (session-checked server
-- functions), so rout_app has BYPASSRLS and the leftover Supabase policies are
-- dropped. rout_app gets DML only: no DDL, no ownership, no role management.
-- Password: set it yourself in the Neon SQL editor (never in git):
--   alter role rout_app with password '<strong password>';

-- 1. Policies that target the legacy roles (public, storage, auth schemas)
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where roles && array['anon','authenticated','service_role']::name[]
              or (schemaname = 'storage')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 2. Legacy roles: revoke every grant explicitly (Neon owners are not members of
--    these roles, so REASSIGN/DROP OWNED is not allowed), then drop them.
do $$
declare r text; s text; o record;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    continue when not exists (select 1 from pg_roles where rolname = r);
    -- objects owned by the legacy role move to the current owner
    for o in select c.oid::regclass::text as name from pg_class c
             join pg_roles ro on ro.oid = c.relowner where ro.rolname = r and c.relkind in ('r','v','m','S','p')
    loop
      execute format('alter table %s owner to %I', o.name, current_user);
    end loop;
    for s in select nspname from pg_namespace
             where nspname not like 'pg\_%' and nspname <> 'information_schema'
    loop
      execute format('revoke all on all tables in schema %I from %I', s, r);
      execute format('revoke all on all sequences in schema %I from %I', s, r);
      execute format('revoke all on all functions in schema %I from %I', s, r);
      execute format('revoke all on schema %I from %I', s, r);
      execute format('alter default privileges in schema %I revoke all on tables from %I', s, r);
      execute format('alter default privileges in schema %I revoke all on sequences from %I', s, r);
      execute format('alter default privileges in schema %I revoke all on functions from %I', s, r);
    end loop;
    -- column-level grants
    for o in select distinct table_schema, table_name from information_schema.column_privileges where grantee = r
    loop
      execute format('revoke all on %I.%I from %I', o.table_schema, o.table_name, r);
    end loop;
    execute format('revoke all on database %I from %I', current_database(), r);
    execute format('drop role %I', r);
  end loop;
end $$;

-- 3. Close PUBLIC
revoke create on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'revoke all on schema auth from public';
  end if;
end $$;

-- 4. Runtime role
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'rout_app') then
    create role rout_app login bypassrls nocreatedb nocreaterole noinherit noreplication;
  else
    alter role rout_app login bypassrls nocreatedb nocreaterole noinherit noreplication nosuperuser;
  end if;
end $$;
alter role rout_app set statement_timeout = '15s';
alter role rout_app set idle_in_transaction_session_timeout = '30s';
alter role rout_app set search_path = public;

do $$ begin
  execute format('grant connect on database %I to rout_app', current_database());
  execute format('revoke create, temporary on database %I from rout_app', current_database());
end $$;

grant usage on schema public to rout_app;
revoke create on schema public from rout_app;
grant select, insert, update, delete on all tables in schema public to rout_app;
grant usage, select on all sequences in schema public to rout_app;
grant execute on all functions in schema public to rout_app;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'grant usage on schema auth to rout_app';
    execute 'grant select on all tables in schema auth to rout_app';
    execute 'grant execute on all functions in schema auth to rout_app';
  end if;
end $$;

-- 5. Objects created by future migrations (run as this owner) get the same rights
do $$ begin
  execute format('alter default privileges for role %I in schema public grant select, insert, update, delete on tables to rout_app', current_user);
  execute format('alter default privileges for role %I in schema public grant usage, select on sequences to rout_app', current_user);
  execute format('alter default privileges for role %I in schema public grant execute on functions to rout_app', current_user);
end $$;

-- 6. Pin search_path on SECURITY DEFINER functions that lack it
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where p.prosecdef and n.nspname in ('public','auth')
             and not coalesce(p.proconfig, '{}') @> array['search_path=public']
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
