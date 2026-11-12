-- Apply AFTER 0188. Never run migrations from the request or daemon.
-- Existing jobs, constraints and owner policies survive the rename.
alter table public.omni_ingest_jobs rename to omni_jobs;
alter table public.omni_jobs add column lease_token uuid;
alter table public.omni_jobs add column next_attempt_at timestamptz not null default now();
create index omni_jobs_claimable on public.omni_jobs(next_attempt_at, created_at) where status='queued';
create index omni_jobs_zombies on public.omni_jobs(updated_at) where status='processing';

-- Non-login capability role. A DBA creates a separate LOGIN and grants only
-- this role to it outside this migration. No BYPASSRLS / owner credential.
create role rout_omni_worker nologin nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public to rout_omni_worker;
grant select on public.omni_jobs to rout_omni_worker;
grant update (status, attempts, updated_at, lease_token, next_attempt_at, content_type,
 title, meta_tag, target_url, local_media_path, kinetic_preview_path, error) on public.omni_jobs to rout_omni_worker;
create policy omni_daemon_jobs on public.omni_jobs to rout_omni_worker
 using (true) with check (true);

create function public.rout_notify_omni_job() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.status='queued' and (tg_op='INSERT' or old.status is distinct from new.status) then
  perform pg_notify('new_omni_job', json_build_object('id',new.id)::text);
 end if;
 if tg_op='INSERT' or old.status is distinct from new.status then
  perform pg_notify('omni_job_changed',json_build_object('id',new.id,'userId',new.user_id)::text);
 end if;
 return new;
end $$;
revoke all on function public.rout_notify_omni_job() from public;
create trigger omni_job_notifications after insert or update on public.omni_jobs
 for each row execute function public.rout_notify_omni_job();

-- Resolve only media referenced by a visible PUBLISHED social-grid snapshot.
-- Owners may preview their private inbox; no public access to unpublished jobs.
create function public.rout_omni_media(p_path text, p_viewer uuid default null)
returns table(object_key text, content_type text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare j public.omni_jobs; snapshot jsonb; b jsonb; i jsonb; profile record; media text;
begin
 select * into j from public.omni_jobs where status='ready'
  and (local_media_path=p_path or kinetic_preview_path=p_path) limit 1;
 if not found then return; end if;
 if p_viewer is distinct from public.rout_current_user_id() then p_viewer:=null; end if;
 if p_viewer is distinct from j.user_id then
  media:='/api/public/gallery-media?path=' || replace(p_path,'/','%2F');
  for profile in
   select p.blocks from public.profiles p
    where p.id=j.user_id and exists(select 1 from public.rout_qa_owner(p.username,'root'))
   union all
   select a.blocks from public.alias_profiles a
    where a.user_id=j.user_id and exists(select 1 from public.rout_qa_owner(a.handle,'alias'))
  loop
   snapshot:=profile.blocks;
   for b in select value from jsonb_array_elements(coalesce(snapshot,'[]'::jsonb)) loop
    if b->>'kind'<>'social_grid' or coalesce((b->>'hidden')::boolean,false)
     or (nullif(b->>'startsAt','') is not null and (b->>'startsAt')::timestamptz>now())
     or (nullif(b->>'expiresAt','') is not null and (b->>'expiresAt')::timestamptz<=now()) then continue; end if;
    for i in select value from jsonb_array_elements(coalesce((b->>'value')::jsonb->'items','[]'::jsonb)) loop
     if i->>'mediaUrl'=media or i->>'kineticPreviewUrl'=media then
      return query select 'users/'||p_path, case when p_path like '%.webm' then 'video/webm' else 'image/webp' end; return;
     end if;
    end loop;
   end loop;
  end loop;
  return;
 end if;
 return query select 'users/'||p_path, case when p_path like '%.webm' then 'video/webm' else 'image/webp' end;
end $$;
revoke all on function public.rout_omni_media(text,uuid) from public;
grant execute on function public.rout_omni_media(text,uuid) to rout_app;