-- Zero-trust baseline: every public table carrying user_id / owner_id / workspace_id / host_user_id
-- gets row level security switched on. With no policy, any role WITHOUT bypassrls sees nothing
-- (deny by default). The server roles (neondb_owner, rout_app) bypass RLS by design; scope is
-- enforced server-side (requireAuth + workspace role checks). This closes direct-role access.
do $$
declare r record;
begin
  for r in
    select distinct c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and not a.attisdropped
      and a.attname in ('user_id', 'owner_id', 'workspace_id', 'host_user_id')
    where c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;
