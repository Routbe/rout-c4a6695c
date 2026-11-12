create table public.presence_broadcast_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 event_id uuid not null,space text not null check(space in ('root','alias')),provider text not null,
 payload jsonb not null,attempts integer not null default 0,created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),claimed_until timestamptz,
 delivered_at timestamptz,last_status integer,unique(user_id,event_id,provider)
);
grant select,insert,update,delete on public.presence_broadcast_jobs to rout_app;
alter table public.presence_broadcast_jobs enable row level security;
alter table public.presence_broadcast_jobs force row level security;
create policy broadcast_owner on public.presence_broadcast_jobs for all to rout_app
 using(user_id=public.rout_current_user_id()) with check(user_id=public.rout_current_user_id());
create index broadcast_due on public.presence_broadcast_jobs(user_id,next_attempt_at) where delivered_at is null;
comment on table public.presence_broadcast_jobs is 'Owner-scoped durable Omnicast queue. Existing user_integrations sealed credential columns hold private configuration; no generated media is uploaded.';
create function public.queue_presence_broadcast() returns trigger language plpgsql set search_path=pg_catalog,public as $$
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
 insert into public.presence_broadcast_jobs(user_id,event_id,space,provider,payload)
 select owner,event,canvas,provider,jsonb_build_object('text',left(message,4000))
 from public.user_integrations where user_id=owner and provider like 'omnicast_%' and connection_status='connected'
 on conflict(user_id,event_id,provider) do nothing;
 return new;
end $$;
create trigger status_broadcast_queue after insert on public.ephemeral_statuses for each row execute function public.queue_presence_broadcast();
create trigger qa_broadcast_queue after update of answer,published on public.profile_questions for each row execute function public.queue_presence_broadcast();