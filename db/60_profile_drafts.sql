-- 60 — Private, owner-bound Studio drafts with optimistic revision control.
create table if not exists public.profile_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  space text not null check (space in ('verified', 'alias')),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  published_revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (user_id, space)
);

create index if not exists profile_drafts_updated_at_idx
  on public.profile_drafts (updated_at desc);

revoke all on public.profile_drafts from public;
grant select, insert, update, delete on public.profile_drafts to rout_app;

create or replace function public.save_profile_draft(
  p_user_id uuid,
  p_space text,
  p_payload jsonb,
  p_expected_revision bigint
) returns table(revision bigint, published_revision bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current bigint;
begin
  if p_space not in ('verified', 'alias') then
    raise exception 'draft_space_invalid';
  end if;

  select d.revision into v_current
    from public.profile_drafts d
   where d.user_id = p_user_id and d.space = p_space
   for update;

  if v_current is null then
    if p_expected_revision <> 0 then raise exception 'draft_conflict'; end if;
    insert into public.profile_drafts (user_id, space, payload, revision)
    values (p_user_id, p_space, p_payload, 1);
  else
    if v_current <> p_expected_revision then raise exception 'draft_conflict'; end if;
    update public.profile_drafts d
       set payload = p_payload, revision = d.revision + 1, updated_at = now()
     where d.user_id = p_user_id and d.space = p_space;
  end if;

  return query
    select d.revision, d.published_revision
      from public.profile_drafts d
     where d.user_id = p_user_id and d.space = p_space;
end;
$$;

create or replace function public.publish_profile_draft(
  p_user_id uuid,
  p_space text,
  p_expected_revision bigint
) returns table(revision bigint, published_revision bigint, published_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payload jsonb;
  v_revision bigint;
begin
  select d.payload, d.revision into v_payload, v_revision
    from public.profile_drafts d
   where d.user_id = p_user_id and d.space = p_space
   for update;

  if v_payload is null or v_revision <> p_expected_revision then
    raise exception 'draft_conflict';
  end if;

  if p_space = 'verified' then
    update public.profiles set
      username = v_payload->>'username',
      display_name = nullif(v_payload->>'displayName', ''),
      tagline = nullif(v_payload->>'tagline', ''),
      avatar_url = nullif(v_payload->>'avatarUrl', ''),
      favicon_url = nullif(v_payload->>'faviconUrl', ''),
      theme = coalesce(nullif(v_payload->>'theme', ''), 'noir'),
      card_style = coalesce(nullif(v_payload->>'cardStyle', ''), 'bordered'),
      blocks = coalesce(v_payload->'blocks', '[]'::jsonb),
      display_prefs = coalesce(v_payload->'displayPrefs', '{}'::jsonb),
      updated_at = now()
    where id = p_user_id;
    if not found then raise exception 'profile_not_found'; end if;
  elsif p_space = 'alias' then
    update public.alias_profiles set
      handle = v_payload->>'username',
      display_name = nullif(v_payload->>'displayName', ''),
      tagline = nullif(v_payload->>'tagline', ''),
      avatar_url = nullif(v_payload->>'avatarUrl', ''),
      favicon_url = nullif(v_payload->>'faviconUrl', ''),
      theme = coalesce(nullif(v_payload->>'theme', ''), 'noir'),
      card_style = coalesce(nullif(v_payload->>'cardStyle', ''), 'bordered'),
      blocks = coalesce(v_payload->'blocks', '[]'::jsonb),
      display_prefs = coalesce(v_payload->'displayPrefs', '{}'::jsonb),
      updated_at = now()
    where user_id = p_user_id;
    if not found then raise exception 'profile_not_found'; end if;
  else
    raise exception 'draft_space_invalid';
  end if;

  update public.profile_drafts d
     set published_revision = d.revision, published_at = now(), updated_at = now()
   where d.user_id = p_user_id and d.space = p_space;

  return query
    select d.revision, d.published_revision, d.published_at
      from public.profile_drafts d
     where d.user_id = p_user_id and d.space = p_space;
end;
$$;

revoke all on function public.save_profile_draft(uuid, text, jsonb, bigint) from public;
revoke all on function public.publish_profile_draft(uuid, text, bigint) from public;
grant execute on function public.save_profile_draft(uuid, text, jsonb, bigint) to rout_app;
grant execute on function public.publish_profile_draft(uuid, text, bigint) to rout_app;