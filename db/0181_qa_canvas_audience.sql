-- Q&A opt-in, published canvas audiences and narrow public design data.
create or replace function public.rout_qa_public(p_handle text, p_space text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.rout_qa_owner(p_handle, p_space);
  if o.owner_id is null then return null; end if;
  return jsonb_build_object(
    'accepting', coalesce((o.prefs ->> 'questionsEnabled')::boolean, false),
    'onHub', coalesce((o.prefs ->> 'qaOnHub')::boolean, true),
    'page', coalesce((o.prefs ->> 'qaPage')::boolean, false),
    'promptKey', o.prefs ->> 'qaPrompt',
    'promptCustom', o.prefs ->> 'qaPromptCustom',
    'displayName', o.display_name,
    'avatarUrl', o.avatar_url,
    -- 0174 may not be applied yet: read the level through to_jsonb so a missing column reads as null.
    'audience', coalesce(o.prefs ->> 'qaAudience', 'members_only'),
    'showAvatar', coalesce((o.prefs ->> 'qaShowAvatar')::boolean, true),
    'showProfileLink', coalesce((o.prefs ->> 'qaShowProfileLink')::boolean, true),
    'design', jsonb_build_object('themeOverrides', o.prefs->'themeOverrides', 'buttonVariant', o.prefs->'buttonVariant', 'buttonRadius', o.prefs->'buttonRadius', 'buttonColor', o.prefs->'buttonColor', 'buttonTextColor', o.prefs->'buttonTextColor', 'fontPairing', o.prefs->'fontPairing', 'buttonsCustom', o.prefs->'buttonsCustom'),
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


grant execute on function public.rout_qa_public(text,text) to rout_app;
grant execute on function public.rout_qa_submit(text,text,text,text,boolean) to rout_app;
