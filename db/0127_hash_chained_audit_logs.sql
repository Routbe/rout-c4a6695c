-- 0127: hash-chained, append-only security audit log + signed daily checkpoints.
-- current_hash = sha256(prev_hash || '|' || event_type || '|' || coalesce(user_id,'') || '|' ||
--   coalesce(actor_id,'') || '|' || payload_json::text || '|' || created_at (ISO, UTC)).
-- The hash is computed inside the database so concurrent writers cannot fork the chain.

create table if not exists public.security_audit_logs (
  id bigserial primary key,
  event_type text not null check (char_length(event_type) between 1 and 80),
  user_id text,
  actor_id text,
  ip_hash text,
  user_agent_hash text,
  payload_json jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  current_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_logs_user_idx on public.security_audit_logs (user_id, created_at desc);
create index if not exists security_audit_logs_created_idx on public.security_audit_logs (created_at);

create table if not exists public.security_audit_checkpoints (
  day date primary key,
  last_id bigint not null,
  last_hash text not null,
  row_count bigint not null,
  signature text not null,
  created_at timestamptz not null default now()
);

create or replace function public.security_audit_chain() returns trigger
language plpgsql as $$
declare
  prev text;
begin
  perform pg_advisory_xact_lock(727001);
  select current_hash into prev from public.security_audit_logs order by id desc limit 1;
  if prev is null then
    select last_hash into prev from public.security_audit_checkpoints order by day desc limit 1;
  end if;
  new.prev_hash := coalesce(prev, repeat('0', 64));
  new.created_at := date_trunc('milliseconds', coalesce(new.created_at, now()));
  new.current_hash := encode(sha256(convert_to(
    new.prev_hash || '|' || new.event_type || '|' || coalesce(new.user_id, '') || '|' ||
    coalesce(new.actor_id, '') || '|' || new.payload_json::text || '|' ||
    to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'UTF8')), 'hex');
  return new;
end $$;

drop trigger if exists security_audit_chain on public.security_audit_logs;
create trigger security_audit_chain before insert on public.security_audit_logs
  for each row execute function public.security_audit_chain();

-- Append-only: UPDATE/TRUNCATE always refused; DELETE only for the retention job
-- (session flag rout.audit_retention = 'on') and only for rows older than 365 days.
create or replace function public.security_audit_refuse() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and tg_table_name = 'security_audit_logs'
     and current_setting('rout.audit_retention', true) = 'on'
     and old.created_at < now() - interval '365 days' then
    return old;
  end if;
  raise exception 'security audit tables are append-only (% refused)', tg_op;
end $$;

drop trigger if exists security_audit_no_update on public.security_audit_logs;
create trigger security_audit_no_update before update or delete on public.security_audit_logs
  for each row execute function public.security_audit_refuse();
drop trigger if exists security_audit_no_truncate on public.security_audit_logs;
create trigger security_audit_no_truncate before truncate on public.security_audit_logs
  for each statement execute function public.security_audit_refuse();

drop trigger if exists security_checkpoint_no_change on public.security_audit_checkpoints;
create trigger security_checkpoint_no_change before update or delete on public.security_audit_checkpoints
  for each row execute function public.security_audit_refuse();
drop trigger if exists security_checkpoint_no_truncate on public.security_audit_checkpoints;
create trigger security_checkpoint_no_truncate before truncate on public.security_audit_checkpoints
  for each statement execute function public.security_audit_refuse();

-- Server-only tables: RLS on, no policy (deny for rout_app once BYPASSRLS is off).
alter table public.security_audit_logs enable row level security;
alter table public.security_audit_checkpoints enable row level security;
