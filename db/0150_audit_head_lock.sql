-- Forward-only. Records current disclosure state, not historical authenticity.
-- Encrypted payload logs are separate and do not contain entry_hash.
lock table public.identity_disclosure_logs in access exclusive mode;
alter table public.users add column latest_audit_hash text
  check (latest_audit_hash is null or latest_audit_hash ~ '^[0-9a-f]{64}$');
update public.users u set latest_audit_hash = (
  select l.entry_hash from public.identity_disclosure_logs l
  where l.user_id=u.id order by l.disclosed_at desc,l.id desc limit 1
);

create or replace function public.disclosure_chain_insert() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare prior_time timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,146));
  select u.latest_audit_hash into new.previous_hash from public.users u where u.id=new.user_id;
  select l.disclosed_at into prior_time from public.identity_disclosure_logs l
    where l.user_id=new.user_id order by l.disclosed_at desc,l.id desc limit 1;
  new.previous_hash := coalesce(new.previous_hash,repeat('0',64));
  new.disclosed_at := greatest(date_trunc('milliseconds',clock_timestamp()),coalesce(prior_time + interval '1 millisecond','-infinity'::timestamptz));
  new.entry_hash := public.disclosure_hash(new.previous_hash,new.user_id,new.client_id,new.disclosed_scopes,new.disclosed_at);
  return new;
end $$;
revoke all on function public.disclosure_chain_insert() from public,rout_app;

create function public.disclosure_head_advance() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.users set latest_audit_hash=new.entry_hash where id=new.user_id;
  return new;
end $$;
revoke all on function public.disclosure_head_advance() from public,rout_app;
create trigger disclosure_head_advance after insert on public.identity_disclosure_logs
  for each row execute function public.disclosure_head_advance();

create function public.disclosure_head_protect() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if (tg_op='INSERT' and new.latest_audit_hash is not null) or
     (tg_op='UPDATE' and new.latest_audit_hash is distinct from old.latest_audit_hash and pg_trigger_depth()<2) then
    raise exception 'audit head is trigger-managed' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.disclosure_head_protect() from public,rout_app;
create trigger disclosure_head_protect before insert or update of latest_audit_hash on public.users
  for each row execute function public.disclosure_head_protect();

-- Policies use the canonical transaction-local user setting. Empty means no user.
create or replace function public.rout_current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('rout.current_user_id',true),'')::uuid $$;
do $$ declare p record; q text;
begin
  for p in select * from pg_policies where schemaname='public'
    and (coalesce(qual,'') like '%rout.user_id%' or coalesce(with_check,'') like '%rout.user_id%') loop
    q := format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
    if p.qual is not null then q:=q || ' using (' || replace(p.qual,'rout.user_id','rout.current_user_id') || ')'; end if;
    if p.with_check is not null then q:=q || ' with check (' || replace(p.with_check,'rout.user_id','rout.current_user_id') || ')'; end if;
    execute q;
  end loop;
end $$;