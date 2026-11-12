-- Preserve the narrow published Q&A projection, including active styling switches.
create or replace function public.rout_qa_public(p_handle text, p_space text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.rout_qa_owner(p_handle, p_space);
  if o.owner_id is null then return null; end if;
  return jsonb_build_object(
    'accepting', coalesce((o.prefs->>'questionsEnabled')::boolean, false),
    'onHub', coalesce((o.prefs->>'qaOnHub')::boolean, true),
    'page', coalesce((o.prefs->>'qaPage')::boolean, false),
    'promptKey', o.prefs->>'qaPrompt', 'promptCustom', o.prefs->>'qaPromptCustom',
    'displayName', o.display_name, 'avatarUrl', o.avatar_url,
    'audience', coalesce(o.prefs->>'qaAudience', 'members_only'),
    'showAvatar', coalesce((o.prefs->>'qaShowAvatar')::boolean, true),
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
-- CREATE OR REPLACE retains existing execution grants; no role privileges change.
  );
end $$;