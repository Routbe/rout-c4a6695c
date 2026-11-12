-- Recheck publication at enqueue and immediately before outbound delivery.
create function public.rout_broadcast_event_allowed(p_owner uuid,p_event uuid,p_space text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare h text;
begin
 if p_owner is distinct from public.rout_current_user_id() then return false;end if;
 if p_space='root' then select username into h from public.profiles where id=p_owner;
 elsif p_space='alias' then select handle into h from public.alias_profiles where user_id=p_owner;
 else return false;end if;
 if h is null or not exists(select 1 from public.rout_qa_owner(h,p_space) where owner_id=p_owner) then return false;end if;
 return exists(select 1 from public.ephemeral_statuses where id=p_event and user_id=p_owner and space=p_space and status_type='micro_text' and expires_at>now())
 or exists(select 1 from public.profile_questions where id=p_event and owner_id=p_owner and space=p_space and published and not is_quarantined and answer is not null and story_until>now());
end $$;
revoke all on function public.rout_broadcast_event_allowed(uuid,uuid,text) from public;
grant execute on function public.rout_broadcast_event_allowed(uuid,uuid,text) to rout_app;
revoke all on function public.rout_presence_public(text,text) from public;
grant execute on function public.rout_presence_public(text,text) to rout_app;
create or replace function public.queue_presence_broadcast() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare owner uuid; event uuid; canvas text; message text;
begin
 if tg_table_name='profile_questions' then
  if not new.published or new.answer is null or new.is_quarantined then return new;end if;
  owner:=new.owner_id;event:=new.id;canvas:=new.space;message:=new.body||E'\n\n'||new.answer;
 else
  owner:=new.user_id;event:=new.id;canvas:=new.space;
  if new.status_type<>'micro_text' then return new;end if;
  message:=new.content_payload->>'text';
 end if;
 if not public.rout_broadcast_event_allowed(owner,event,canvas) then return new;end if;
 insert into public.presence_broadcast_jobs(user_id,event_id,space,provider,payload)
 select owner,event,canvas,provider,jsonb_build_object('text',left(message,4000)) from public.user_integrations
 where user_id=owner and provider in ('omnicast_mastodon','omnicast_bluesky','omnicast_telegram','omnicast_webhook')
 and connection_status='connected' and coalesce(status_json->'broadcastSpaces','[]'::jsonb) ? canvas
 on conflict(user_id,event_id,provider) do nothing;
 return new;
end $$;