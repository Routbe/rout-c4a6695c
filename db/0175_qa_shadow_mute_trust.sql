-- 0175 — Zero-knowledge anonymous Q&A: spaces, prompts, shadow mutes and the
-- global trust score. Idempotent.
--
-- * A question belongs to one canvas (root = verified profile, alias = /u/),
--   so answers on an alias never show on the verified profile or vice versa.
-- * The server remembers who sent a question (signed-in account and/or a
--   hashed device key) only so the recipient can mute that sender. The runtime
--   role cannot read those columns: rout_app gets column grants without them,
--   and new questions enter only through rout_qa_submit().
-- * A muted (or globally shadow-banned) sender still gets "ok"; the question is
--   stored quarantined for moderation and never reaches the inbox.
-- * Every new mute of an account or device costs that sender 20 trust points.
--   Below 50 a 7-day global shadow-ban is scheduled to start after a random
--   12-48 hour delay, so a sender cannot deduce which recipient caused it.

-- 1. Questions: canvas, prompt, sender (hidden), quarantine.
alter table public.profile_questions add column if not exists space text not null default 'root';
alter table public.profile_questions add column if not exists prompt text;
alter table public.profile_questions add column if not exists sender_user_id uuid references public.users (id) on delete set null;
alter table public.profile_questions add column if not exists sender_key text;
alter table public.profile_questions add column if not exists is_quarantined boolean not null default false;
alter table public.profile_questions add column if not exists quarantine_reason text;
alter table public.profile_questions add column if not exists style_masked boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profile_questions_space_check') then
    alter table public.profile_questions add constraint profile_questions_space_check check (space in ('root', 'alias'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_questions_prompt_check') then
    alter table public.profile_questions add constraint profile_questions_prompt_check check (prompt is null or char_length(prompt) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_questions_sender_key_check') then
    alter table public.profile_questions add constraint profile_questions_sender_key_check check (sender_key is null or sender_key ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_questions_quarantine_check') then
    alter table public.profile_questions add constraint profile_questions_quarantine_check
      check (quarantine_reason is null or quarantine_reason in ('local_mute', 'global_ban', 'muted_by_owner'));
  end if;
end $$;

create index if not exists profile_questions_inbox_idx on public.profile_questions (owner_id, space, created_at desc) where not is_quarantined;
create index if not exists profile_questions_sender_idx on public.profile_questions (sender_user_id) where sender_user_id is not null;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke select, insert, update on public.profile_questions from rout_app;
    grant select (id, owner_id, space, body, answer, published, created_at, answered_at, story_until, prompt, is_quarantined, style_masked)
      on public.profile_questions to rout_app;
    grant update (answer, published, answered_at, story_until) on public.profile_questions to rout_app;
    grant delete on public.profile_questions to rout_app;
  end if;
end $$;

-- 2. Trust score on accounts, and the same ledger for anonymous device keys.
alter table public.users add column if not exists trust_score integer not null default 100;
alter table public.users add column if not exists global_shadow_ban_starts_at timestamptz;
alter table public.users add column if not exists global_shadow_ban_until timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_trust_score_range') then
    alter table public.users add constraint users_trust_score_range check (trust_score between 0 and 100);
  end if;
end $$;

create table if not exists public.qa_guest_trust (
  sender_key      text primary key check (sender_key ~ '^[0-9a-f]{64}$'),
  trust_score     integer not null default 100 check (trust_score between 0 and 100),
  ban_starts_at   timestamptz,
  ban_until       timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.qa_guest_trust enable row level security;
-- No grants and no policies: only the security-definer functions below touch it.

-- 3. Shadow mutes: one row per muted account and one per muted device key.
create table if not exists public.shadow_mutes (
  id               uuid primary key default gen_random_uuid(),
  recipient_id     uuid not null references public.users (id) on delete cascade,
  muted_sender_id  uuid references public.users (id) on delete cascade,
  muted_sender_key text check (muted_sender_key is null or muted_sender_key ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz not null default now(),
  constraint shadow_mutes_has_sender check (muted_sender_id is not null or muted_sender_key is not null),
  constraint shadow_mutes_recipient_sender_key unique (recipient_id, muted_sender_id)
);
create unique index if not exists shadow_mutes_recipient_device_key
  on public.shadow_mutes (recipient_id, muted_sender_key) where muted_sender_key is not null;

alter table public.shadow_mutes enable row level security;
drop policy if exists rout_scope on public.shadow_mutes;
create policy rout_scope on public.shadow_mutes for all
  using (recipient_id = public.rout_current_user_id())
  with check (recipient_id = public.rout_current_user_id());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.shadow_mutes from rout_app;
    -- The recipient may list and lift their own mutes, never see who is muted.
    grant select (id, recipient_id, created_at) on public.shadow_mutes to rout_app;
    grant delete on public.shadow_mutes to rout_app;
  end if;
end $$;

-- 4. Trust trigger: -20 per new mute, scheduled global ban below 50.
create or replace function public.rout_shadow_mute_trust()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_score integer;
  v_start timestamptz := now() + make_interval(mins => 720 + floor(random() * 2161)::int);
begin
  if new.muted_sender_id is not null then
    update public.users u
       set trust_score = greatest(0, u.trust_score - 20)
     where u.id = new.muted_sender_id
     returning u.trust_score into v_score;
    if v_score is not null and v_score < 50 then
      update public.users u
         set global_shadow_ban_starts_at = v_start,
             global_shadow_ban_until = v_start + interval '7 days'
       where u.id = new.muted_sender_id
         and (u.global_shadow_ban_until is null or u.global_shadow_ban_until < now());
    end if;
  elsif new.muted_sender_key is not null then
    insert into public.qa_guest_trust as g (sender_key, trust_score)
         values (new.muted_sender_key, 80)
    on conflict (sender_key) do update
         set trust_score = greatest(0, g.trust_score - 20), updated_at = now()
    returning g.trust_score into v_score;
    if v_score < 50 then
      update public.qa_guest_trust g
         set ban_starts_at = v_start, ban_until = v_start + interval '7 days', updated_at = now()
       where g.sender_key = new.muted_sender_key
         and (g.ban_until is null or g.ban_until < now());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rout_shadow_mute_trust on public.shadow_mutes;
create trigger rout_shadow_mute_trust after insert on public.shadow_mutes
  for each row execute function public.rout_shadow_mute_trust();

-- 5. Owner resolution (internal: never granted, the owner id stays server-side).
create or replace function public.rout_qa_owner(p_handle text, p_space text)
returns table(owner_id uuid, prefs jsonb, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.display_prefs, '{}'::jsonb), p.display_name, p.avatar_url
    from public.profiles p
   where p_space = 'root'
     and lower(p.username) = lower(p_handle)
     and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
     and coalesce(p.is_banned, false) = false
     and coalesce(p.is_suspended, false) = false
     and coalesce(p.status, 'active') not in ('frozen', 'banned', 'suspended')
  union all
  select a.user_id, coalesce(a.display_prefs, '{}'::jsonb), a.display_name, a.avatar_url
    from public.alias_profiles a
    join public.profiles p on p.id = a.user_id
   where p_space = 'alias'
     and lower(a.handle) = lower(p_handle)
     and a.enabled
     and coalesce((a.display_prefs ->> 'publicProfile')::boolean, true)
     and coalesce(p.is_banned, false) = false
     and coalesce(p.is_suspended, false) = false
     and coalesce(p.status, 'active') not in ('frozen', 'banned', 'suspended')
   limit 1
$$;
revoke all on function public.rout_qa_owner(text, text) from public;

-- 6. Public read: settings + answered questions, never the owner id.
create or replace function public.rout_qa_public(p_handle text, p_space text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.rout_qa_owner(p_handle, p_space);
  if o.owner_id is null then return null; end if;
  return jsonb_build_object(
    'accepting', coalesce((o.prefs ->> 'questionsEnabled')::boolean, true),
    'onHub', coalesce((o.prefs ->> 'qaOnHub')::boolean, true),
    'page', coalesce((o.prefs ->> 'qaPage')::boolean, false),
    'promptKey', o.prefs ->> 'qaPrompt',
    'promptCustom', o.prefs ->> 'qaPromptCustom',
    'displayName', o.display_name,
    'avatarUrl', o.avatar_url,
    -- 0174 may not be applied yet: read the level through to_jsonb so a missing column reads as null.
    'qaLevel', (select to_jsonb(u) ->> 'qa_permission_level' from public.users u where u.id = o.owner_id),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'body', q.body, 'answer', q.answer, 'prompt', q.prompt,
                                          'answeredAt', q.answered_at, 'storyUntil', q.story_until) order by q.answered_at desc)
        from (select * from public.profile_questions q
               where q.owner_id = o.owner_id and q.space = p_space and q.published
                 and q.answer is not null and not q.is_quarantined
               order by q.answered_at desc limit 30) q
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.rout_qa_public(text, text) from public;

-- 7. Submit: the only way in. Always answers 'ok' for muted/banned senders.
create or replace function public.rout_qa_submit(p_handle text, p_space text, p_body text, p_sender_key text, p_masked boolean)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  o record;
  v_sender uuid := public.rout_current_user_id();
  v_key text := case when p_sender_key ~ '^[0-9a-f]{64}$' then p_sender_key end;
  v_prompt text;
  v_reason text;
begin
  if p_space not in ('root', 'alias') then return 'not_found'; end if;
  if p_body is null or char_length(p_body) not between 1 and 300 then return 'invalid'; end if;
  select * into o from public.rout_qa_owner(p_handle, p_space);
  if o.owner_id is null or not coalesce((o.prefs ->> 'questionsEnabled')::boolean, true) then return 'not_found'; end if;
  v_prompt := nullif(left(btrim(coalesce(
    case when o.prefs ->> 'qaPrompt' = 'custom' then o.prefs ->> 'qaPromptCustom' end,
    o.prefs ->> 'qaPrompt')), 120), '');

  if exists (select 1 from public.shadow_mutes m
              where m.recipient_id = o.owner_id
                and ((v_sender is not null and m.muted_sender_id = v_sender)
                  or (v_key is not null and m.muted_sender_key = v_key))) then
    v_reason := 'local_mute';
  elsif exists (select 1 from public.users u
                 where u.id = v_sender and u.global_shadow_ban_starts_at <= now() and u.global_shadow_ban_until > now())
     or exists (select 1 from public.profiles p where p.id = v_sender and coalesce(p.is_shadowbanned, false))
     or exists (select 1 from public.qa_guest_trust g
                 where g.sender_key = v_key and g.ban_starts_at <= now() and g.ban_until > now()) then
    v_reason := 'global_ban';
  end if;

  insert into public.profile_questions (owner_id, space, body, prompt, sender_user_id, sender_key, is_quarantined, quarantine_reason, style_masked)
       values (o.owner_id, p_space, p_body, v_prompt, v_sender, v_key, v_reason is not null, v_reason, coalesce(p_masked, false));
  return 'ok';
end $$;
revoke all on function public.rout_qa_submit(text, text, text, text, boolean) from public;

-- 8. Mute by message id: the recipient never learns who the sender is.
create or replace function public.rout_qa_mute_by_message(p_message_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := public.rout_current_user_id();
  q record;
begin
  if v_me is null then return false; end if;
  select owner_id, sender_user_id, sender_key into q from public.profile_questions where id = p_message_id;
  if not found or q.owner_id <> v_me then return false; end if;
  if q.sender_user_id is not null and q.sender_user_id <> v_me then
    insert into public.shadow_mutes (recipient_id, muted_sender_id) values (v_me, q.sender_user_id)
    on conflict (recipient_id, muted_sender_id) do nothing;
  end if;
  if q.sender_key is not null then
    insert into public.shadow_mutes (recipient_id, muted_sender_key) values (v_me, q.sender_key)
    on conflict (recipient_id, muted_sender_key) where muted_sender_key is not null do nothing;
  end if;
  update public.profile_questions
     set is_quarantined = true, quarantine_reason = 'muted_by_owner', published = false
   where id = p_message_id;
  return true;
end $$;
revoke all on function public.rout_qa_mute_by_message(uuid) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_qa_public(text, text) to rout_app;
    grant execute on function public.rout_qa_submit(text, text, text, text, boolean) to rout_app;
    grant execute on function public.rout_qa_mute_by_message(uuid) to rout_app;
  end if;
end $$;
