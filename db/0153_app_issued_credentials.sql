-- Forward-only credential hub. Requires reviewed application deployment.
create type public.app_credential_type as enum ('badge','certificate','diploma');
create table public.app_issued_credentials (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 client_id text not null references public.oauth_clients(client_id) on delete cascade,
 type public.app_credential_type not null,
 title text not null,
 description text,
 image_url text,
 issued_at timestamptz not null default now(),
 revoked_at timestamptz,
 accepted_at timestamptz,
 show_on_name boolean not null default false,
 request_key text not null,
 unique(client_id,request_key)
);
grant select,update,delete on public.app_issued_credentials to rout_app;
alter table public.app_issued_credentials enable row level security;
create policy credential_recipient_read on public.app_issued_credentials for select to rout_app using(user_id=public.rout_current_user_id());
create policy credential_recipient_delete on public.app_issued_credentials for delete to rout_app using(user_id=public.rout_current_user_id());
-- Restrict update columns: recipients cannot change issuer statements.
revoke update on public.app_issued_credentials from rout_app;
grant update(accepted_at,show_on_name) on public.app_issued_credentials to rout_app;
create policy credential_recipient_accept on public.app_issued_credentials for update to rout_app using(user_id=public.rout_current_user_id()) with check(user_id=public.rout_current_user_id());
create table public.user_connected_apps_visibility (
 user_id uuid not null references public.users(id) on delete cascade,
 client_id text not null references public.oauth_clients(client_id) on delete cascade,
 is_public boolean not null default false,
 primary key(user_id,client_id)
);
grant select,insert,update,delete on public.user_connected_apps_visibility to rout_app;
alter table public.user_connected_apps_visibility enable row level security;
create policy credential_visibility_owner on public.user_connected_apps_visibility to rout_app using(user_id=public.rout_current_user_id()) with check(user_id=public.rout_current_user_id());
create index credential_recipient_idx on public.app_issued_credentials(user_id,issued_at desc,id);

-- Fixed public projection; no raw recipient rows or private identity fields.
create function public.public_app_credentials(p_handle text) returns table(
 id uuid,client_id text,type public.app_credential_type,title text,description text,image_url text,issued_at timestamptz,show_on_name boolean,app_name text,issuer_handle text
) language sql stable security definer set search_path=pg_catalog as $$
 select k.id,k.client_id,k.type,k.title,k.description,k.image_url,k.issued_at,k.show_on_name,c.name,issuer.username
 from public.app_issued_credentials k
 join public.users u on u.id=k.user_id
 join public.profiles p on p.id=k.user_id
 join public.user_connected_apps_visibility v on v.user_id=k.user_id and v.client_id=k.client_id and v.is_public
 join public.oauth_clients c on c.client_id=k.client_id and c.status='active'
 join public.oauth_consents g on g.user_id=k.user_id and g.client_id=k.client_id and g.revoked_at is null
 left join public.profiles issuer on issuer.id=c.owner_user_id
 where p.username=p_handle and not p.is_banned and not p.is_suspended and not u.is_disabled
 and coalesce((p.display_prefs->>'publicProfile')::boolean,true)
 and k.accepted_at is not null and k.revoked_at is null
 order by k.issued_at desc,k.id desc limit 100
$$;
revoke all on function public.public_app_credentials(text) from public;
grant execute on function public.public_app_credentials(text) to rout_app;
-- No INSERT grant or issuing function yet: authenticated app capabilities must
-- be reviewed separately, not inferred from a client id supplied by a caller.