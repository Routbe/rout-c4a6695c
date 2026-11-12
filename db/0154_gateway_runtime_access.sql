-- 0154: runtime access when the linked gateway login is the database owner.
-- Applied on Neon 2026-11-01 after review with the project owner.
--
-- 1. The owner login steps down to rout_app per batch (src/lib/neon.ts:
--    `set local role rout_app`), so RLS keeps applying.
do $$
begin
  -- Only on Neon, where the linked login is neondb_owner; replays on a fresh database skip it.
  if exists (select 1 from pg_roles where rolname = 'neondb_owner') then
    execute 'grant rout_app to neondb_owner with inherit false, set true';
  end if;
end $$;

-- 2. Better Auth tables used by src/lib/better-auth.server.ts.
grant usage on schema neon_auth to rout_app;
grant select, insert, update, delete
  on neon_auth."user", neon_auth.session, neon_auth.account, neon_auth.verification
  to rout_app;

-- 3. Server-only tables: RLS on with no policy locked rout_app out entirely.
--    Access to these is decided in server code (browser queries go through
--    src/lib/db/policy.server.ts), so rout_app gets one permissive policy.
--    Tables with per-user rout_scope policies are untouched; tables with no
--    rout_app grant (signing keys, tokens) stay unreachable.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
       and has_table_privilege('rout_app', c.oid, 'select')
  loop
    execute format('create policy rout_server on public.%I to rout_app using (true) with check (true)', r.relname);
  end loop;
end $$;
