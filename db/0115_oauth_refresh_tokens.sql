alter table public.oauth_clients add column subject_type text not null default 'public'
  check (subject_type in ('public','pairwise'));
-- Existing clients retain public subjects. New clients get pairwise subjects.
alter table public.oauth_clients alter column subject_type set default 'pairwise';
alter table public.oauth_clients add column sector_id text;
alter table public.oauth_clients add column post_logout_redirect_uris text[] not null default '{}';
alter table public.oauth_auth_codes add column auth_time timestamptz;
alter table public.oauth_consents add column revoked_at timestamptz;

create table public.oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  token_hash text not null unique,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  scopes text[] not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  subject text not null,
  auth_time timestamptz,
  acr text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.oauth_refresh_tokens to rout_app;
alter table public.oauth_refresh_tokens enable row level security;
create policy oauth_refresh_owner on public.oauth_refresh_tokens to rout_app
using (user_id::text=current_setting('rout.user_id',true))
with check (user_id::text=current_setting('rout.user_id',true));
create index oauth_refresh_family_idx on public.oauth_refresh_tokens(family_id);
create index oauth_refresh_owner_idx on public.oauth_refresh_tokens(user_id,client_id);

create table public.oauth_access_tokens (
  token_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  scopes text[] not null,
  family_id uuid,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.oauth_access_tokens to rout_app;
alter table public.oauth_access_tokens enable row level security;
create policy oauth_access_owner on public.oauth_access_tokens to rout_app
using (user_id::text=current_setting('rout.user_id',true))
with check (user_id::text=current_setting('rout.user_id',true));
create index oauth_access_owner_idx on public.oauth_access_tokens(user_id,client_id);
create index oauth_access_family_idx on public.oauth_access_tokens(family_id);

-- Row lock serializes family rotation. Replay revocation is committed, never rolled back by a thrown SQL error.
create function public.rotate_oauth_refresh(old_hash text, target_client text, new_hash text)
returns table(result text,user_id uuid,subject text,scopes text[],family_id uuid,auth_time timestamptz,acr text)
language plpgsql set search_path=pg_catalog,public as $$
declare old public.oauth_refresh_tokens%rowtype;
begin
  select * into old from public.oauth_refresh_tokens t where t.token_hash=old_hash and t.client_id=target_client for update;
  if not found then return query select 'invalid'::text,null::uuid,null::text,null::text[],null::uuid,null::timestamptz,null::text; return; end if;
  -- Family-wide advisory lock prevents a concurrent descendant issuance from escaping revocation.
  perform pg_advisory_xact_lock(hashtextextended(old.family_id::text,0));
  if old.used_at is not null then
    update public.oauth_refresh_tokens t set revoked_at=coalesce(t.revoked_at,now()) where t.family_id=old.family_id;
    update public.oauth_access_tokens t set revoked_at=coalesce(t.revoked_at,now()) where t.family_id=old.family_id;
    return query select 'reuse'::text,null::uuid,null::text,null::text[],old.family_id,null::timestamptz,null::text; return;
  end if;
  if old.revoked_at is not null or old.expires_at<=now()
    or exists(select 1 from public.oauth_refresh_tokens t where t.family_id=old.family_id and t.revoked_at is not null)
    or not exists(select 1 from public.oauth_consents c where c.user_id=old.user_id and c.client_id=target_client and c.revoked_at is null and 'offline_access'=any(c.scopes))
    or not exists(select 1 from public.users u where u.id=old.user_id and not u.is_disabled and u.account_status='active')
    or not exists(select 1 from public.oauth_clients c where c.client_id=target_client and c.status='active') then
    return query select 'invalid'::text,null::uuid,null::text,null::text[],old.family_id,null::timestamptz,null::text; return;
  end if;
  update public.oauth_refresh_tokens t set used_at=now() where t.id=old.id;
  insert into public.oauth_refresh_tokens(family_id,token_hash,client_id,user_id,scopes,expires_at,subject,auth_time,acr)
  values(old.family_id,new_hash,target_client,old.user_id,old.scopes,old.expires_at,old.subject,old.auth_time,old.acr);
  return query select 'ok'::text,old.user_id,old.subject,old.scopes,old.family_id,old.auth_time,old.acr;
end $$;
revoke all on function public.rotate_oauth_refresh(text,text,text) from public;
grant execute on function public.rotate_oauth_refresh(text,text,text) to rout_app;