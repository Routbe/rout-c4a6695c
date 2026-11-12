-- Statuses reference existing published content; no media bytes or duplicate matrix.
create type public.presence_status_type as enum ('qa_reply','micro_text','omni_drop');
create table public.ephemeral_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  space text not null check(space in ('root','alias')),
  status_type public.presence_status_type not null,
  content_payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
grant select,insert,update,delete on public.ephemeral_statuses to rout_app;
alter table public.ephemeral_statuses enable row level security;
alter table public.ephemeral_statuses force row level security;
create policy presence_owner on public.ephemeral_statuses for all to rout_app
 using(user_id=public.rout_current_user_id()) with check(user_id=public.rout_current_user_id());
create index presence_owner_expiry on public.ephemeral_statuses(user_id,space,expires_at);

create function public.validate_ephemeral_presence() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare p jsonb := new.content_payload; q record;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4096 then raise exception 'invalid_status_payload'; end if;
 if new.status_type='micro_text' then
  if jsonb_typeof(p->'text') is distinct from 'string' or char_length(btrim(p->>'text')) not between 1 and 280
   or coalesce(p->>'theme','aurora') not in ('aurora','glass')
   or (p ? 'theme' and jsonb_typeof(p->'theme') is distinct from 'string')
   or exists(select 1 from jsonb_object_keys(p) k where k not in ('text','theme')) then raise exception 'invalid_micro_text'; end if;
 elsif new.status_type='omni_drop' then
  if jsonb_typeof(p->'blockId') is distinct from 'string' or char_length(p->>'blockId') not between 1 and 100
   or (p ? 'itemId' and (jsonb_typeof(p->'itemId') is distinct from 'string' or char_length(p->>'itemId') not between 1 and 100))
   or exists(select 1 from jsonb_object_keys(p) k where k not in ('blockId','itemId')) then raise exception 'invalid_omni_drop'; end if;
 else
  if jsonb_typeof(p->'questionId') is distinct from 'string' or exists(select 1 from jsonb_object_keys(p) k where k<>'questionId') then raise exception 'invalid_qa_reference'; end if;
  select owner_id,space,answered_at,story_until into q from public.profile_questions
   where id=(p->>'questionId')::uuid and owner_id=new.user_id and published and answer is not null and not is_quarantined;
  if not found or q.space<>new.space or q.story_until is null then raise exception 'invalid_qa_reference'; end if;
 end if;
 if tg_op='INSERT' then new.created_at:=now(); new.expires_at:=now()+interval '24 hours';
 else new.created_at:=old.created_at;new.expires_at:=old.expires_at;
  if new.user_id<>old.user_id or new.space<>old.space or new.status_type<>old.status_type then raise exception 'immutable_status_identity'; end if;
 end if;
 return new;
end $$;
create trigger presence_validation before insert or update on public.ephemeral_statuses
 for each row execute function public.validate_ephemeral_presence();

-- Narrow public read boundary. Existing Q&A records remain the only answer source.
create function public.rout_presence_public(p_handle text,p_space text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o record; blocks jsonb; result jsonb;
begin
 select * into o from public.rout_qa_owner(p_handle,p_space);
 if o.owner_id is null then return '[]'::jsonb; end if;
 if p_space='alias' then select a.blocks into blocks from public.alias_profiles a where a.user_id=o.owner_id;
 else select p.blocks into blocks from public.profiles p where p.id=o.owner_id; end if;
 select coalesce(jsonb_agg(s.data order by s.at),'[]'::jsonb) into result from (
  select q.answered_at as at,jsonb_build_object('id',q.id,'statusType','qa_reply','question',q.body,'answer',q.answer,'createdAt',q.answered_at,'expiresAt',q.story_until) as data
  from public.profile_questions q where q.owner_id=o.owner_id and q.space=p_space and q.published
   and q.answer is not null and not q.is_quarantined and q.story_until>now()
  union all
  select e.created_at,jsonb_build_object('id',e.id,'statusType','micro_text','text',e.content_payload->>'text','theme',coalesce(e.content_payload->>'theme','aurora'),'createdAt',e.created_at,'expiresAt',e.expires_at)
  from public.ephemeral_statuses e where e.user_id=o.owner_id and e.space=p_space and e.status_type='micro_text' and e.expires_at>now()
  union all
  select e.created_at,jsonb_build_object('id',e.id,'statusType','omni_drop','blockId',b->>'id','title',coalesce(i->>'caption',b->>'label'),'targetUrl',coalesce(i->>'targetUrl',b->>'value'),'mediaUrl',coalesce(i->>'mediaUrl',b->>'thumbnailUrl'),'badge',b->>'badge','createdAt',e.created_at,'expiresAt',e.expires_at)
  from public.ephemeral_statuses e
  cross join lateral jsonb_array_elements(coalesce(blocks,'[]'::jsonb)) b
  left join lateral jsonb_array_elements(case when b->>'kind'='social_grid' then coalesce((b->>'value')::jsonb->'items','[]'::jsonb) else '[]'::jsonb end) i on i->>'id'=e.content_payload->>'itemId'
  where e.user_id=o.owner_id and e.space=p_space and e.status_type='omni_drop' and e.expires_at>now()
   and b->>'id'=e.content_payload->>'blockId' and coalesce((b->>'hidden')::boolean,false)=false
   and (nullif(b->>'startsAt','') is null or (b->>'startsAt')::timestamptz<=now())
   and (nullif(b->>'expiresAt','') is null or (b->>'expiresAt')::timestamptz>now())
   and (not(e.content_payload ? 'itemId') or i is not null)
  order by at desc limit 30
 ) s;
 return result;
end $$;
comment on table public.ephemeral_statuses is 'Text or published-block references only; fixed 24h lifetime. Q&A answers remain in profile_questions and resolve at read time.';