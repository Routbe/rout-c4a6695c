-- Tamper-evident hash chain with canonical SHA-256 leaves; Merkle roots computed by verifier.
alter table public.identity_disclosure_logs add column previous_hash text;
alter table public.identity_disclosure_logs add column entry_hash text;
grant select, insert on public.identity_disclosure_logs to rout_app;

create or replace function public.disclosure_hash(prev text, uid uuid, cid text, scopes text[], ts timestamptz)
returns text language plpgsql immutable as $$
declare s text; input text := ''; fields text[];
begin
  fields := array[prev, uid::text, cid] || scopes || array[to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')];
  foreach s in array fields loop input := input || octet_length(s)::text || ':' || s; end loop;
  return encode(sha256(convert_to(input, 'UTF8')), 'hex');
end $$;

-- One-time legacy backfill, NOT evidence of integrity before this migration.
do $$ declare r record; prev text := repeat('0',64); owner uuid; hash text;
begin
  for r in select * from public.identity_disclosure_logs order by user_id, disclosed_at, id loop
    if owner is distinct from r.user_id then prev := repeat('0',64); owner := r.user_id; end if;
    hash := public.disclosure_hash(prev,r.user_id,r.client_id,r.disclosed_scopes,date_trunc('milliseconds',r.disclosed_at));
    update public.identity_disclosure_logs set previous_hash=prev,entry_hash=hash,disclosed_at=date_trunc('milliseconds',r.disclosed_at) where id=r.id;
    prev := hash;
  end loop;
end $$;
alter table public.identity_disclosure_logs alter column previous_hash set not null;
alter table public.identity_disclosure_logs alter column entry_hash set not null;

create or replace function public.disclosure_chain_insert() returns trigger language plpgsql as $$
declare prior_time timestamptz;
begin
  -- Serialize all writes for this owner; a concurrent writer cannot fork the chain.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 146));
  select entry_hash,disclosed_at into new.previous_hash,prior_time from public.identity_disclosure_logs
    where user_id=new.user_id order by disclosed_at desc,id desc limit 1;
  new.previous_hash := coalesce(new.previous_hash,repeat('0',64));
  new.disclosed_at := greatest(date_trunc('milliseconds',clock_timestamp()), coalesce(prior_time + interval '1 millisecond', '-infinity'::timestamptz));
  new.entry_hash := public.disclosure_hash(new.previous_hash,new.user_id,new.client_id,new.disclosed_scopes,new.disclosed_at);
  return new;
end $$;
create trigger disclosure_chain_insert before insert on public.identity_disclosure_logs for each row execute function public.disclosure_chain_insert();
create or replace function public.disclosure_no_rewrite() returns trigger language plpgsql as $$
begin raise exception 'disclosure ledger cannot be rewritten'; end $$;
create trigger disclosure_no_rewrite before update on public.identity_disclosure_logs for each row execute function public.disclosure_no_rewrite();
-- User deletion cascades remain possible; do not block GDPR hard deletion.
revoke update, delete, truncate on public.identity_disclosure_logs from rout_app;