-- 0208 — Blind, append-only protocol event ledger (E2EVSP).
--
-- Each row is one Ed25519-signed event whose hash covers the previous event's
-- hash (Merkle chain per stream). The server stores ciphertext bodies only and
-- validates signature, chain position and capabilities in application code
-- (src/lib/protocol/*) before calling rout_protocol_append. The database adds
-- the last line of defence: rows can never be updated, deleted or truncated,
-- and an event can only extend the current head of its stream.
--
-- protocol_dpop_jti is a replay cache for one-time DPoP proofs, not state;
-- it is the only table here that prunes (expired proofs only).
-- The application role gets no table privileges, only the functions below.
-- Idempotent; run as owner.

create table if not exists public.protocol_events (
  stream_id   text   not null check (stream_id ~ '^urn:rout:stream:[A-Za-z0-9_-]{22}$'),
  seq         bigint not null check (seq >= 0),
  prev_hash   text            check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash        text   not null unique check (hash ~ '^[0-9a-f]{64}$'),
  author_did  text   not null check (author_did ~ '^did:key:z[1-9A-HJ-NP-Za-km-z]{40,60}$'),
  kind        text   not null check (kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$' and length(kind) <= 64),
  cap_id      text            check (cap_id ~ '^urn:rout:zcap:[A-Za-z0-9_-]{22}$'),
  event       jsonb  not null check (octet_length(event::text) <= 70000),
  received_at timestamptz not null default now(),
  primary key (stream_id, seq),
  check ((seq = 0) = (prev_hash is null)),
  check ((seq = 0) = (kind = 'stream.genesis'))
);
create index if not exists protocol_events_revocations_idx
  on public.protocol_events (stream_id, ((event -> 'body' -> 'public' ->> 'capId')))
  where kind = 'cap.revoke';

create or replace function public.rout_protocol_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'protocol_events is append-only' using errcode = '42501';
end $$;

drop trigger if exists protocol_events_no_update on public.protocol_events;
create trigger protocol_events_no_update before update or delete on public.protocol_events
  for each row execute function public.rout_protocol_events_immutable();
drop trigger if exists protocol_events_no_truncate on public.protocol_events;
create trigger protocol_events_no_truncate before truncate on public.protocol_events
  for each statement execute function public.rout_protocol_events_immutable();

create table if not exists public.protocol_dpop_jti (
  jkt        text not null check (jkt ~ '^[A-Za-z0-9_-]{43}$'),
  jti        text not null check (length(jti) between 16 and 128),
  expires_at timestamptz not null,
  primary key (jkt, jti)
);
create index if not exists protocol_dpop_jti_expires_idx on public.protocol_dpop_jti (expires_at);

revoke all on public.protocol_events, public.protocol_dpop_jti from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.protocol_events, public.protocol_dpop_jti from rout_app;
  end if;
end $$;
alter table public.protocol_events enable row level security;
alter table public.protocol_dpop_jti enable row level security;

-- Appends one pre-verified event. Returns 'ok', 'conflict' (seq taken: a
-- concurrent writer won, or a replay), 'unknown_stream' or 'chain_broken'.
create or replace function public.rout_protocol_append(
  p_stream text, p_seq bigint, p_prev text, p_hash text, p_author text, p_kind text, p_cap_id text, p_event jsonb
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare head_hash text; inserted int;
begin
  if p_seq > 0 then
    select hash into head_hash from public.protocol_events where stream_id = p_stream and seq = p_seq - 1;
    if head_hash is null then
      if not exists (select 1 from public.protocol_events where stream_id = p_stream) then return 'unknown_stream'; end if;
      return 'chain_broken';
    end if;
    if head_hash <> p_prev then return 'chain_broken'; end if;
  end if;
  insert into public.protocol_events (stream_id, seq, prev_hash, hash, author_did, kind, cap_id, event)
  values (p_stream, p_seq, p_prev, p_hash, p_author, p_kind, p_cap_id, p_event)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return case when inserted = 1 then 'ok' else 'conflict' end;
end $$;

-- Controller (genesis author) and current head of a stream; no row when unknown.
create or replace function public.rout_protocol_head(p_stream text)
returns table (controller text, head_seq bigint, head_hash text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select g.author_did, h.seq, h.hash
  from public.protocol_events g
  cross join lateral (
    select seq, hash from public.protocol_events where stream_id = p_stream order by seq desc limit 1
  ) h
  where g.stream_id = p_stream and g.seq = 0
$$;

-- Which of the given capability ids the stream controller revoked.
create or replace function public.rout_protocol_revoked(p_stream text, p_ids text[])
returns setof text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct e.event -> 'body' -> 'public' ->> 'capId'
  from public.protocol_events e
  join public.protocol_events g on g.stream_id = e.stream_id and g.seq = 0
  where e.stream_id = p_stream and e.kind = 'cap.revoke' and e.author_did = g.author_did
    and (e.event -> 'body' -> 'public' ->> 'capId') = any (p_ids)
$$;

-- Signed events after p_after (exclusive), oldest first, at most 200.
create or replace function public.rout_protocol_read(p_stream text, p_after bigint, p_limit int)
returns setof jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select event from public.protocol_events
  where stream_id = p_stream and seq > coalesce(p_after, -1)
  order by seq
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

-- true = first use of this DPoP proof, false = replay.
create or replace function public.rout_protocol_dpop_spend(p_jkt text, p_jti text, p_expires_at timestamptz)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare inserted int;
begin
  delete from public.protocol_dpop_jti where expires_at < now() - interval '1 minute';
  insert into public.protocol_dpop_jti (jkt, jti, expires_at)
  values (p_jkt, p_jti, least(p_expires_at, now() + interval '5 minutes'))
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end $$;

revoke all on function public.rout_protocol_append(text, bigint, text, text, text, text, text, jsonb) from public;
revoke all on function public.rout_protocol_head(text) from public;
revoke all on function public.rout_protocol_revoked(text, text[]) from public;
revoke all on function public.rout_protocol_read(text, bigint, int) from public;
revoke all on function public.rout_protocol_dpop_spend(text, text, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_protocol_append(text, bigint, text, text, text, text, text, jsonb) to rout_app;
    grant execute on function public.rout_protocol_head(text) to rout_app;
    grant execute on function public.rout_protocol_revoked(text, text[]) to rout_app;
    grant execute on function public.rout_protocol_read(text, bigint, int) to rout_app;
    grant execute on function public.rout_protocol_dpop_spend(text, text, timestamptz) to rout_app;
  end if;
end $$;
