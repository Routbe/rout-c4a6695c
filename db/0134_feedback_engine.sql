-- Scoped feedback; anonymous visitors only use narrow functions, never table access.
create table public.feedback_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  type text not null default 'stars_5' check (type in ('stars_5','nps_10','emoji_3','text_review')),
  show_on_profile boolean not null default true,
  full_page boolean not null default false,
  slug text not null unique default gen_random_uuid()::text,
  profile_space text not null check (profile_space in ('root','alias','workspace')),
  profile_handle text not null,
  created_at timestamptz not null default now(),
  check ((profile_space = 'workspace') = (workspace_id is not null))
);
create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.feedback_forms(id) on delete cascade,
  rating int check (rating between 0 and 10),
  comment text check (char_length(comment) <= 2000),
  reviewer_name text check (char_length(reviewer_name) <= 100),
  allow_featured boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  check (not is_featured or allow_featured)
);
create index feedback_forms_scope_idx on public.feedback_forms(workspace_id, user_id, created_at);
create index feedback_responses_form_idx on public.feedback_responses(form_id, created_at desc, id);
alter table public.feedback_forms enable row level security;
alter table public.feedback_responses enable row level security;
create policy rout_scope on public.feedback_forms using (
  (workspace_id is null and user_id = public.rout_current_user_id()) or
  (workspace_id is not null and public.rout_is_workspace_member(workspace_id))
) with check (
  (workspace_id is null and user_id = public.rout_current_user_id()) or
  (workspace_id is not null and public.rout_is_workspace_member(workspace_id))
);
create policy rout_scope on public.feedback_responses using (
  exists (select 1 from public.feedback_forms f where f.id = form_id)
) with check (exists (select 1 from public.feedback_forms f where f.id = form_id));

-- An alias, root or workspace is explicitly bound: no cross-namespace reviews.
create function public.feedback_form_is_public(f public.feedback_forms) returns boolean
language sql stable security definer set search_path = public as $$
  select case f.profile_space
    when 'alias' then exists (
      select 1 from public.alias_profiles a join public.profiles p on p.id = a.user_id
      where a.user_id = f.user_id and a.handle = f.profile_handle and a.enabled
        and coalesce((a.display_prefs->>'publicProfile')::boolean, true)
        and not coalesce(p.is_banned,false) and not coalesce(p.is_suspended,false)
        and coalesce(p.status,'active') not in ('frozen','banned','suspended'))
    when 'root' then exists (
      select 1 from public.profiles p where p.id = f.user_id and p.username = f.profile_handle
        and p.workspace_id is null and coalesce((p.display_prefs->>'publicProfile')::boolean,true)
        and not coalesce(p.is_banned,false) and not coalesce(p.is_suspended,false)
        and coalesce(p.status,'active') not in ('frozen','banned','suspended'))
    when 'workspace' then exists (
      select 1 from public.workspaces w join public.profiles p on p.workspace_id = w.id
      where w.id = f.workspace_id and w.slug = f.profile_handle
        and coalesce((p.display_prefs->>'publicProfile')::boolean,true)
        and not coalesce(p.is_banned,false) and not coalesce(p.is_suspended,false)
        and coalesce(p.status,'active') not in ('frozen','banned','suspended'))
    else false end
$$;
revoke all on function public.feedback_form_is_public(public.feedback_forms) from public;

create function public.read_public_feedback(p_slug text, p_space text, p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'title',f.title,'type',f.type,'slug',f.slug,
    'showOnProfile',f.show_on_profile,'fullPage',f.full_page,
    'profileSpace',f.profile_space,'profileHandle',f.profile_handle,
    'featured',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'formId',r.form_id,'rating',r.rating,'comment',r.comment,
      'reviewerName',r.reviewer_name,'isFeatured',true,'allowFeatured',true,'createdAt',r.created_at))
      from (select * from public.feedback_responses where form_id=f.id and is_featured and allow_featured
            order by created_at desc, id limit 20) r),'[]'::jsonb)
  )),'[]'::jsonb) from (
    select * from public.feedback_forms f
    where public.feedback_form_is_public(f)
      and (case when p_slug is not null then f.slug=p_slug
           else f.profile_space=p_space and f.profile_handle=p_handle and f.show_on_profile end)
    order by f.created_at limit 50
  ) f
$$;
revoke all on function public.read_public_feedback(text,text,text) from public;

create function public.submit_public_feedback(p_form uuid, p_rating int, p_comment text, p_name text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare f public.feedback_forms; result uuid;
begin
  select * into f from public.feedback_forms where id=p_form;
  if not found or not public.feedback_form_is_public(f) then raise exception 'feedback_unavailable'; end if;
  if char_length(coalesce(p_comment,'')) > 2000 or char_length(coalesce(p_name,'')) > 100 then
    raise exception 'feedback_invalid';
  end if;
  if (f.type='text_review' and (p_rating is not null or char_length(trim(coalesce(p_comment,'')))=0))
    or (f.type<>'text_review' and (p_rating is null or
      p_rating < case when f.type='nps_10' then 0 else 1 end or
      p_rating > case when f.type='nps_10' then 10 when f.type='emoji_3' then 3 else 5 end)) then
    raise exception 'feedback_invalid';
  end if;
  insert into public.feedback_responses(form_id,rating,comment,reviewer_name,allow_featured)
    values(p_form,p_rating,nullif(trim(p_comment),''),nullif(trim(p_name),''),coalesce(p_consent,false)) returning id into result;
  return result;
end $$;
revoke all on function public.submit_public_feedback(uuid,int,text,text,boolean) from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='rout_app') then
    grant select, insert, update, delete on public.feedback_forms, public.feedback_responses to rout_app;
    grant execute on function public.read_public_feedback(text,text,text),
      public.submit_public_feedback(uuid,int,text,text,boolean) to rout_app;
  end if;
end $$;