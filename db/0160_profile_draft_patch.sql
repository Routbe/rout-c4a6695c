-- 0160 — Atomic Studio mutations: merge one section into a draft instead of
-- replacing the whole payload. Fields merge at the top level, display prefs
-- merge key by key, and a missing or malformed displayPrefs always starts
-- from '{}' (fail-safe default), so an empty alias can never break a save.
create or replace function public.patch_profile_draft(
  p_user_id uuid,
  p_space text,
  p_fields jsonb,
  p_prefs jsonb,
  p_drop_prefs text[]
)
returns table(revision bigint, published_revision bigint)
language plpgsql
set search_path to 'public'
as $$
declare
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_prefs jsonb := coalesce(p_prefs, '{}'::jsonb);
begin
  if p_space not in ('verified', 'alias') then
    raise exception 'draft_space_invalid';
  end if;
  if jsonb_typeof(v_fields) <> 'object' or jsonb_typeof(v_prefs) <> 'object' then
    raise exception 'validation: draft patch must be an object';
  end if;

  return query
    update public.profile_drafts d
       set payload = (
             (case when jsonb_typeof(d.payload) = 'object' then d.payload else '{}'::jsonb end)
             || (v_fields - 'displayPrefs')
           ) || jsonb_build_object(
             'displayPrefs',
             ((case when jsonb_typeof(d.payload -> 'displayPrefs') = 'object'
                    then d.payload -> 'displayPrefs' else '{}'::jsonb end)
               - coalesce(p_drop_prefs, '{}'::text[]))
             || v_prefs
           ),
           revision = d.revision + 1,
           updated_at = now()
     where d.user_id = p_user_id and d.space = p_space
    returning d.revision, d.published_revision;

  if not found then
    raise exception 'draft_not_found';
  end if;
end;
$$;

revoke all on function public.patch_profile_draft(uuid, text, jsonb, jsonb, text[]) from public;
grant execute on function public.patch_profile_draft(uuid, text, jsonb, jsonb, text[]) to rout_app;
