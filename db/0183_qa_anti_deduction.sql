-- 0183 — Anti-deduction patch for anonymous Q&A. Idempotent.
--
-- * Sender identity is never stored raw any more. The app sends keyed base
--   hashes (HMAC with a server secret the database never sees); this file
--   scopes them to one recipient canvas, so two recipients' rows cannot be
--   linked to the same person even with full database access.
-- * Global abuse protection uses a separate key that rotates every 30 days in
--   the app, is kept on a question for 7 days only, and whose trust charges
--   expire after 90 days. Trust heals +10 per quiet week.
-- * Mutes are per canvas (root/alias): muting on one never affects the other.
-- * Delivery is delayed by a random 2–10 minutes and the inbox sorts by that
--   moment, so a sender cannot time the recipient's "pling".
-- * Both outcomes of a send (delivered / quarantined) run the same checks and
--   the same insert; the app pads every answer to the same duration.
-- * Mob protection: one sender loses at most 20 points per 24 hours, and
--   mutes from the same muter network within 7 days count once.
-- * Under-18 accounts get private Q&A defaults (verified accounts only);
--   parental consent stays at under 16 (0174).

-- 1. Question columns: scoped keys, short-lived abuse key, delayed visibility.
alter table public.profile_questions add column if not exists sender_acct_key text;
alter table public.profile_questions add column if not exists abuse_key text;
alter table public.profile_questions add column if not exists abuse_key_until timestamptz;
alter table public.profile_questions add column if not exists visible_after timestamptz;
update public.profile_questions set visible_after = created_at where visible_after is null;
alter table public.profile_questions alter column visible_after set default now();
alter table public.profile_questions alter column visible_after set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profile_questions_sender_acct_key_check') then
    alter table public.profile_questions add constraint profile_questions_sender_acct_key_check
      check (sender_acct_key is null or sender_acct_key ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_questions_abuse_key_check') then
    alter table public.profile_questions add constraint profile_questions_abuse_key_check
      check (abuse_key is null or abuse_key ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- Existing rows carried a raw account id or a global device hash: drop them.
update public.profile_questions
   set sender_user_id = null, sender_key = null
 where sender_user_id is not null or sender_key is not null;

create index if not exists profile_questions_visible_idx
  on public.profile_questions (owner_id, visible_after desc, id desc) where not is_quarantined;
create index if not exists profile_questions_abuse_expiry_idx
  on public.profile_questions (abuse_key_until) where abuse_key is not null;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    -- Sender and abuse columns stay unreadable for the runtime role.
    grant select (visible_after) on public.profile_questions to rout_app;
  end if;
end $$;

-- 2. Mutes are per canvas. Legacy rows (space null) keep covering both.
alter table public.shadow_mutes add column if not exists space text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shadow_mutes_space_check') then
    alter table public.shadow_mutes add constraint shadow_mutes_space_check check (space is null or space in ('root', 'alias'));
  end if;
end $$;
create index if not exists shadow_mutes_recipient_space_key_idx
  on public.shadow_mutes (recipient_id, space, muted_sender_key) where muted_sender_key is not null;

-- 3. Trust charges remember the muter's network (keyed, daily-rotating hash).
alter table public.qa_trust_charges add column if not exists muter_net text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qa_trust_charges_muter_net_check') then
    alter table public.qa_trust_charges add constraint qa_trust_charges_muter_net_check
      check (muter_net is null or muter_net ~ '^[0-9a-f]{64}$');
  end if;
end $$;
create index if not exists qa_trust_charges_sender_time_idx on public.qa_trust_charges (sender_key, charged_at desc) where sender_key is not null;

alter table public.users add column if not exists trust_healed_at timestamptz;

-- Charging moves into the mute function (abuse key, not the scoped mute key).
drop trigger if exists rout_shadow_mute_trust on public.shadow_mutes;

-- 4. Scope a base key to one recipient canvas.
create or replace function public.rout_qa_scope_key(p_base text, p_owner uuid, p_space text)
returns text language sql immutable set search_path = public as $$
  select case when p_base ~ '^[0-9a-f]{64}$'
              then encode(sha256(convert_to(p_base || ':' || p_owner::text || ':' || p_space, 'UTF8')), 'hex') end
$$;
revoke all on function public.rout_qa_scope_key(text, uuid, text) from public;

-- 5. One trust charge: -20 at most once per 24h per sender, once per muter network per 7 days.
create or replace function public.rout_qa_charge(p_recipient uuid, p_abuse_key text, p_net text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_id bigint;
  v_net text := case when p_net ~ '^[0-9a-f]{64}$' then p_net end;
  v_score integer;
  v_start timestamptz := now() + make_interval(mins => 720 + floor(random() * 2161)::int);
begin
  if p_abuse_key is null or p_abuse_key !~ '^[0-9a-f]{64}$' then return; end if;
  insert into public.qa_trust_charges (recipient_id, sender_key, muter_net) values (p_recipient, p_abuse_key, v_net)
  on conflict (recipient_id, sender_key) where sender_key is not null do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  if exists (select 1 from public.qa_trust_charges c
              where c.sender_key = p_abuse_key and c.id <> v_id and c.charged_at > now() - interval '24 hours') then
    return;
  end if;
  if v_net is not null and exists (select 1 from public.qa_trust_charges c
              where c.sender_key = p_abuse_key and c.id <> v_id and c.muter_net = v_net
                and c.charged_at > now() - interval '7 days') then
    return;
  end if;
  insert into public.qa_guest_trust as g (sender_key, trust_score) values (p_abuse_key, 80)
  on conflict (sender_key) do update set trust_score = greatest(0, g.trust_score - 20), updated_at = now()
  returning g.trust_score into v_score;
  if v_score < 50 then
    update public.qa_guest_trust g
       set ban_starts_at = v_start, ban_until = v_start + interval '7 days', updated_at = now()
     where g.sender_key = p_abuse_key and (g.ban_until is null or g.ban_until < now());
  end if;
end $$;
revoke all on function public.rout_qa_charge(uuid, text, text) from public;

-- 6. Submit: the only way in. Every path runs the same checks and the same insert.
drop function if exists public.rout_qa_submit(text, text, text, text, boolean);
create or replace function public.rout_qa_submit(
  p_handle text, p_space text, p_body text,
  p_device_base text, p_acct_base text, p_abuse_now text, p_abuse_prev text, p_masked boolean)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  o record;
  v_sender uuid := public.rout_current_user_id();
  v_dev text;
  v_acct text;
  v_abuse text := case when p_abuse_now ~ '^[0-9a-f]{64}$' then p_abuse_now end;
  v_abuse_prev text := case when p_abuse_prev ~ '^[0-9a-f]{64}$' then p_abuse_prev end;
  v_prompt text;
  v_local boolean;
  v_global boolean;
  v_reason text;
  v_level text;
begin
  if p_space not in ('root', 'alias') then return 'not_found'; end if;
  if p_body is null or char_length(p_body) not between 1 and 300 then return 'invalid'; end if;
  select * into o from public.rout_qa_owner(p_handle, p_space);
  if o.owner_id is null or not coalesce((o.prefs ->> 'questionsEnabled')::boolean, false) then return 'not_found'; end if;
  v_level := coalesce(o.prefs->>'qaAudience', 'members_only');
  if v_level not in ('public_unrestricted', 'members_only', 'verified_only') then return 'not_found'; end if;
  if v_level <> 'public_unrestricted' and v_sender is null then return 'not_found'; end if;
  if v_level = 'verified_only' and not exists (select 1 from public.profiles where id=v_sender and verified is true) then return 'not_found'; end if;
  if exists (select 1 from public.users where id=o.owner_id and qa_permission_level='disabled') then return 'not_found'; end if;
  if exists (select 1 from public.users where id=o.owner_id and qa_permission_level='verified_only') and not exists (select 1 from public.profiles where id=v_sender and verified is true) then return 'not_found'; end if;
  if exists (select 1 from public.users where id=o.owner_id and qa_permission_level='members_only') and v_sender is null then return 'not_found'; end if;
  v_prompt := nullif(left(btrim(coalesce(
    case when o.prefs ->> 'qaPrompt' = 'custom' then o.prefs ->> 'qaPromptCustom' end,
    o.prefs ->> 'qaPrompt')), 120), '');

  v_dev := public.rout_qa_scope_key(p_device_base, o.owner_id, p_space);
  v_acct := case when v_sender is not null then public.rout_qa_scope_key(p_acct_base, o.owner_id, p_space) end;

  -- Both checks always run, whatever the first one finds.
  v_local := exists (select 1 from public.shadow_mutes m
                      where m.recipient_id = o.owner_id
                        and (m.space is null or m.space = p_space)
                        and ((m.muted_sender_key is not null and m.muted_sender_key in (v_dev, v_acct))
                          or (v_sender is not null and m.space is null and m.muted_sender_id = v_sender)));
  v_global := exists (select 1 from public.users u
                       where u.id = v_sender and u.global_shadow_ban_starts_at <= now() and u.global_shadow_ban_until > now())
           or exists (select 1 from public.profiles p where p.id = v_sender and coalesce(p.is_shadowbanned, false))
           or exists (select 1 from public.qa_guest_trust g
                       where g.sender_key in (v_abuse, v_abuse_prev) and g.ban_starts_at <= now() and g.ban_until > now());
  v_reason := case when v_local then 'local_mute' when v_global then 'global_ban' end;

  insert into public.profile_questions
    (owner_id, space, body, prompt, sender_key, sender_acct_key, abuse_key, abuse_key_until,
     is_quarantined, quarantine_reason, style_masked, visible_after)
  values
    (o.owner_id, p_space, p_body, v_prompt, v_dev, v_acct, v_abuse,
     case when v_abuse is not null then now() + interval '7 days' end,
     v_reason is not null, v_reason, coalesce(p_masked, false),
     now() + make_interval(secs => 120 + floor(random() * 481)::int));
  return 'ok';
end $$;
revoke all on function public.rout_qa_submit(text, text, text, text, text, text, text, boolean) from public;

-- 7. Mute by message id: canvas-scoped mute rows; trust charged on the abuse key.
drop function if exists public.rout_qa_mute_by_message(uuid);
create or replace function public.rout_qa_mute_by_message(p_message_id uuid, p_muter_net text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := public.rout_current_user_id();
  q record;
  v_action uuid;
begin
  if v_me is null then return false; end if;
  select owner_id, space, sender_key, sender_acct_key, abuse_key, abuse_key_until into q
    from public.profile_questions where id = p_message_id;
  if not found or q.owner_id <> v_me then return false; end if;
  if exists (select 1 from public.qa_mute_actions a where a.recipient_id = v_me and a.source_question_id = p_message_id) then
    return true;
  end if;
  insert into public.qa_mute_actions (recipient_id, source_question_id) values (v_me, p_message_id) returning id into v_action;
  if q.sender_key is not null then
    insert into public.shadow_mutes (recipient_id, action_id, muted_sender_key, space) values (v_me, v_action, q.sender_key, q.space);
  end if;
  if q.sender_acct_key is not null and q.sender_acct_key is distinct from q.sender_key then
    insert into public.shadow_mutes (recipient_id, action_id, muted_sender_key, space) values (v_me, v_action, q.sender_acct_key, q.space);
  end if;
  if q.abuse_key is not null and q.abuse_key_until > now() then
    perform public.rout_qa_charge(v_me, q.abuse_key, p_muter_net);
  end if;
  update public.profile_questions
     set is_quarantined = true, quarantine_reason = 'muted_by_owner', published = false
   where id = p_message_id;
  return true;
end $$;
revoke all on function public.rout_qa_mute_by_message(uuid, text) from public;

-- 8. Public data (0182 projection): no avatar URL when the owner hides the avatar.
create or replace function public.rout_qa_public(p_handle text, p_space text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record; v_show boolean;
begin
  select * into o from public.rout_qa_owner(p_handle, p_space);
  if o.owner_id is null then return null; end if;
  v_show := coalesce((o.prefs->>'qaShowAvatar')::boolean, true);
  return jsonb_build_object(
    'accepting', coalesce((o.prefs->>'questionsEnabled')::boolean, false),
    'onHub', coalesce((o.prefs->>'qaOnHub')::boolean, true),
    'page', coalesce((o.prefs->>'qaPage')::boolean, false),
    'promptKey', o.prefs->>'qaPrompt', 'promptCustom', o.prefs->>'qaPromptCustom',
    'displayName', o.display_name,
    'avatarUrl', case when v_show then o.avatar_url end,
    'audience', coalesce(o.prefs->>'qaAudience', 'members_only'),
    'showAvatar', v_show,
    'showProfileLink', coalesce((o.prefs->>'qaShowProfileLink')::boolean, true),
    'design', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      from jsonb_each(coalesce(o.prefs, '{}'::jsonb))
      where key in ('themeOverrides', 'buttonVariant', 'buttonRadius', 'buttonColor',
        'buttonTextColor', 'buttonSize', 'fontPairing', 'buttonsCustom', 'typographyCustom',
        'glassStyle', 'glassOpacity', 'glassBlur', 'glassBorder', 'glassTargets')),
    'qaLevel', (select to_jsonb(u)->>'qa_permission_level' from public.users u where u.id=o.owner_id),
    'answers', coalesce((select jsonb_agg(jsonb_build_object(
      'id',q.id,'body',q.body,'answer',q.answer,'prompt',q.prompt,
      'answeredAt',q.answered_at,'storyUntil',q.story_until) order by q.answered_at desc)
      from (select id,body,answer,prompt,answered_at,story_until from public.profile_questions
        where owner_id=o.owner_id and space=p_space and published and answer is not null
          and not is_quarantined order by answered_at desc limit 30) q), '[]'::jsonb)
  );
end $$;

-- 9. Daily maintenance: expiry, retention and healing.
create or replace function public.rout_qa_maintenance()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_abuse int; v_quar int; v_charges int; v_healed int; v_users int; v_rl int;
begin
  update public.profile_questions set abuse_key = null, abuse_key_until = null
   where abuse_key is not null and abuse_key_until < now();
  get diagnostics v_abuse = row_count;
  delete from public.profile_questions
   where is_quarantined and quarantine_reason in ('local_mute', 'global_ban') and created_at < now() - interval '30 days';
  get diagnostics v_quar = row_count;
  delete from public.qa_trust_charges where charged_at < now() - interval '90 days';
  get diagnostics v_charges = row_count;
  update public.qa_guest_trust set trust_score = least(100, trust_score + 10), updated_at = now()
   where trust_score < 100 and updated_at < now() - interval '7 days';
  get diagnostics v_healed = row_count;
  delete from public.qa_guest_trust where trust_score >= 100 and (ban_until is null or ban_until < now());
  update public.users set trust_score = least(100, trust_score + 10), trust_healed_at = now()
   where trust_score < 100 and coalesce(trust_healed_at, '-infinity'::timestamptz) < now() - interval '7 days';
  get diagnostics v_users = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rl = row_count;
  return jsonb_build_object('abuseKeysExpired', v_abuse, 'quarantineDeleted', v_quar, 'chargesExpired', v_charges,
                            'guestsHealed', v_healed, 'usersHealed', v_users, 'rateLimitsDeleted', v_rl);
end $$;
revoke all on function public.rout_qa_maintenance() from public;

-- 10. Under-18: private Q&A defaults. Consent (is_minor) stays under 16.
create or replace function public.rout_users_minor_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  new.is_minor := new.date_of_birth is not null and new.date_of_birth > (current_date - interval '16 years');
  if new.date_of_birth is not null and new.date_of_birth > (current_date - interval '18 years')
     and (tg_op = 'INSERT' or old.date_of_birth is distinct from new.date_of_birth) then
    new.qa_permission_level := 'verified_only';
  end if;
  return new;
end $$;
update public.users set qa_permission_level = 'verified_only'
 where date_of_birth > (current_date - interval '18 years') and qa_permission_level = 'public_unrestricted';

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_qa_submit(text, text, text, text, text, text, text, boolean) to rout_app;
    grant execute on function public.rout_qa_mute_by_message(uuid, text) to rout_app;
    grant execute on function public.rout_qa_public(text, text) to rout_app;
    grant execute on function public.rout_qa_maintenance() to rout_app;
    revoke all on function public.rout_qa_charge(uuid, text, text) from rout_app;
    revoke all on function public.rout_qa_scope_key(text, uuid, text) from rout_app;
  end if;
end $$;
