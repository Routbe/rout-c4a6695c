-- Pulse styling: closed enums for background, font, alignment and one short emoji sticker.
-- Same 24h lifetime, owner RLS and 4 KB payload cap as 0185; requires 0185.
create or replace function public.validate_ephemeral_presence() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare p jsonb := new.content_payload; q record;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4096 then raise exception 'invalid_status_payload'; end if;
 if new.status_type='micro_text' then
  if jsonb_typeof(p->'text') is distinct from 'string' or char_length(btrim(p->>'text')) not between 1 and 280
   or coalesce(p->>'theme','aurora') not in ('aurora','glass')
   or (p ? 'theme' and jsonb_typeof(p->'theme') is distinct from 'string')
   or coalesce(p->>'bg','none') not in ('none','sunset','ocean','forest','noir','candy','gold')
   or coalesce(p->>'font','classic') not in ('classic','display','mono','hand')
   or coalesce(p->>'align','center') not in ('left','center','right')
   or (p ? 'sticker' and (jsonb_typeof(p->'sticker') is distinct from 'string' or char_length(p->>'sticker') not between 1 and 8))
   or exists(select 1 from jsonb_object_keys(p) k where k not in ('text','theme','bg','font','align','sticker')) then raise exception 'invalid_micro_text'; end if;
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
create or replace function public.rout_presence_public(p_handle text,p_space text) returns jsonb
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
  select e.created_at,jsonb_build_object('id',e.id,'statusType','micro_text','text',e.content_payload->>'text','theme',coalesce(e.content_payload->>'theme','aurora'),'bg',e.content_payload->>'bg','font',e.content_payload->>'font','align',e.content_payload->>'align','sticker',e.content_payload->>'sticker','createdAt',e.created_at,'expiresAt',e.expires_at)
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
revoke all on function public.rout_presence_public(text,text) from public;
grant execute on function public.rout_presence_public(text,text) to rout_app;
