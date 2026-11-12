-- Historische bootstrap: kent de rol alleen aan het expliciete eigenaarsadres
-- toe. Een eerste andere beheerder gebruikt de eenmalige tokenflow uit db/49.
--
-- Idempotent: mag zonder gevolgen herhaald worden bij elke deploy.
--
-- De runtime-tegenhanger staat in src/lib/auth/owner-admin.server.ts
-- (ensureOwnerAdmin / claimBootstrapAdmin), die dit ook afdwingt bij elke
-- registratie en login. Deze migratie dekt bestaande omgevingen waar dat
-- pad nog niet is doorlopen.

do $$
declare
  owner_id uuid;
begin
  if to_regclass('public.users') is null or to_regclass('public.user_roles') is null then
    return;
  end if;

  -- 1. hallo@rout.be krijgt altijd de rol, als het account bestaat.
  select id into owner_id
    from public.users
   where lower(email) = 'hallo@rout.be'
   order by created_at asc
   limit 1;

  if owner_id is not null then
    insert into public.user_roles (user_id, role)
    values (owner_id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

end
$$;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
