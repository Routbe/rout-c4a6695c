-- 0193: owner-only, encrypted signup-block subscribers + referrer domain on visits.
--
-- Visitor addresses are stored only as AES-GCM ciphertext (key outside the
-- database) plus a keyed hash for de-duplication. The runtime role can read
-- and delete rows solely for the owner in rout.current_user_id; every public
-- write goes through narrow definer functions that never return addresses.
-- The old plaintext table had an allow-all runtime policy and holds no rows.

create table if not exists public.profile_subscribers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  handle text not null,
  space text not null check (space in ('root', 'alias')),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  email_ciphertext text not null,
  email_iv text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirm_token_hash text unique check (confirm_token_hash is null or confirm_token_hash ~ '^[0-9a-f]{64}$'),
  unsubscribe_token_hash text not null unique check (unsubscribe_token_hash ~ '^[0-9a-f]{64}$'),
  locale text check (locale is null or char_length(locale) <= 10),
  brevo_list_id integer,
  brevo_synced_at timestamptz,
  brevo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  unique (owner_user_id, space, email_hash)
);
create index if not exists profile_subscribers_owner_idx on public.profile_subscribers (owner_user_id, created_at desc);

alter table public.profile_subscribers enable row level security;
revoke all on public.profile_subscribers from public;
grant select, delete on public.profile_subscribers to rout_app;

drop policy if exists profile_subscribers_owner_read on public.profile_subscribers;
create policy profile_subscribers_owner_read on public.profile_subscribers
  for select to rout_app using (owner_user_id = public.rout_current_user_id());
drop policy if exists profile_subscribers_owner_delete on public.profile_subscribers;
create policy profile_subscribers_owner_delete on public.profile_subscribers
  for delete to rout_app using (owner_user_id = public.rout_current_user_id());

-- Public sign-up: resolves the published profile, requires a visible newsletter
-- block, never downgrades a confirmed subscriber and returns no addresses.
create or replace function public.rout_subscriber_join(
  p_handle text, p_hash text, p_ciphertext text, p_iv text,
  p_confirm_hash text, p_unsubscribe_hash text, p_locale text
) returns table (outcome text, out_owner uuid, out_space text, out_list integer)
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
#variable_conflict use_column
declare
  v_owner uuid;
  v_space text;
  v_blocks jsonb;
  v_has_block boolean;
  v_list integer;
  v_status text;
begin
  select p.id, 'root', p.blocks into v_owner, v_space, v_blocks
    from public.profiles p
   where lower(p.username) = lower(p_handle) and coalesce(p.status, 'active') = 'active'
   limit 1;
  if v_owner is null then
    select a.user_id, 'alias', a.blocks into v_owner, v_space, v_blocks
      from public.alias_profiles a where lower(a.handle) = lower(p_handle) limit 1;
  end if;
  if v_owner is null then
    return query select 'not_found'::text, null::uuid, null::text, null::integer;
    return;
  end if;

  select true, nullif(left(regexp_replace(coalesce(b->>'value', ''), '\D', '', 'g'), 9), '')::integer
    into v_has_block, v_list
    from jsonb_array_elements(case when jsonb_typeof(v_blocks) = 'array' then v_blocks else '[]'::jsonb end) b
   where b->>'kind' = 'newsletter' and coalesce(b->>'hidden', 'false') <> 'true'
   limit 1;
  if v_has_block is not true then
    return query select 'no_block'::text, null::uuid, null::text, null::integer;
    return;
  end if;

  select s.status into v_status from public.profile_subscribers s
   where s.owner_user_id = v_owner and s.space = v_space and s.email_hash = p_hash;
  if v_status = 'confirmed' then
    return query select 'already'::text, v_owner, v_space, v_list;
    return;
  end if;

  insert into public.profile_subscribers as s
    (owner_user_id, handle, space, email_hash, email_ciphertext, email_iv, status,
     confirm_token_hash, unsubscribe_token_hash, locale, brevo_list_id)
  values (v_owner, lower(p_handle), v_space, p_hash, p_ciphertext, p_iv, 'pending',
     p_confirm_hash, p_unsubscribe_hash, nullif(left(coalesce(p_locale, ''), 10), ''), v_list)
  on conflict (owner_user_id, space, email_hash) do update set
    handle = excluded.handle,
    email_ciphertext = excluded.email_ciphertext,
    email_iv = excluded.email_iv,
    status = 'pending',
    confirm_token_hash = excluded.confirm_token_hash,
    unsubscribe_token_hash = excluded.unsubscribe_token_hash,
    locale = excluded.locale,
    brevo_list_id = excluded.brevo_list_id,
    unsubscribed_at = null,
    updated_at = now();
  return query select 'pending'::text, v_owner, v_space, v_list;
end $$;

-- Double opt-in: a confirmation link is valid for 7 days and works once.
create or replace function public.rout_subscriber_confirm(p_token_hash text)
returns table (id uuid, owner_user_id uuid, space text, handle text, email_ciphertext text, email_iv text, list_id integer)
language sql volatile security definer set search_path = pg_catalog, public as $$
  update public.profile_subscribers s
     set status = 'confirmed', confirmed_at = now(), confirm_token_hash = null, updated_at = now()
   where s.confirm_token_hash = p_token_hash and s.status = 'pending'
     and s.updated_at > now() - interval '7 days'
  returning s.id, s.owner_user_id, s.space, s.handle, s.email_ciphertext, s.email_iv, s.brevo_list_id;
$$;

-- Unsubscribe wipes the ciphertext; only the keyed hash remains for re-joining.
create or replace function public.rout_subscriber_unsubscribe(p_token_hash text)
returns boolean
language sql volatile security definer set search_path = pg_catalog, public as $$
  with done as (
    update public.profile_subscribers s
       set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null,
           email_ciphertext = '', email_iv = '', updated_at = now()
     where s.unsubscribe_token_hash = p_token_hash and s.status <> 'unsubscribed'
    returning 1
  ) select exists (select 1 from done);
$$;

create or replace function public.rout_subscriber_sync_result(p_id uuid, p_ok boolean, p_error text)
returns void
language sql volatile security definer set search_path = pg_catalog, public as $$
  update public.profile_subscribers
     set brevo_synced_at = case when p_ok then now() else null end,
         brevo_error = case when p_ok then null else left(coalesce(p_error, 'error'), 200) end,
         updated_at = now()
   where id = p_id and status = 'confirmed';
$$;

-- Platform overview: counts only, never addresses or handles.
create or replace function public.rout_subscriber_platform_counts()
returns table (total integer, pending integer, confirmed integer, unsubscribed integer, synced integer, failed integer)
language sql stable security definer set search_path = pg_catalog, public as $$
  select count(*)::int,
         count(*) filter (where status = 'pending')::int,
         count(*) filter (where status = 'confirmed')::int,
         count(*) filter (where status = 'unsubscribed')::int,
         count(*) filter (where brevo_synced_at is not null)::int,
         count(*) filter (where brevo_error is not null)::int
    from public.profile_subscribers;
$$;

revoke all on function public.rout_subscriber_join(text, text, text, text, text, text, text) from public;
revoke all on function public.rout_subscriber_confirm(text) from public;
revoke all on function public.rout_subscriber_unsubscribe(text) from public;
revoke all on function public.rout_subscriber_sync_result(uuid, boolean, text) from public;
revoke all on function public.rout_subscriber_platform_counts() from public;
grant execute on function public.rout_subscriber_join(text, text, text, text, text, text, text) to rout_app;
grant execute on function public.rout_subscriber_confirm(text) to rout_app;
grant execute on function public.rout_subscriber_unsubscribe(text) to rout_app;
grant execute on function public.rout_subscriber_sync_result(uuid, boolean, text) to rout_app;
grant execute on function public.rout_subscriber_platform_counts() to rout_app;

-- Retire the plaintext table (empty; its runtime policy allowed every row).
drop table if exists public.newsletter_subscribers;

-- Richer stats: referring site as a bare domain, never a full URL.
alter table public.profile_visits add column if not exists referrer_domain text
  check (referrer_domain is null or referrer_domain ~ '^[a-z0-9.-]{1,253}$');
