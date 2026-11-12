-- ROUT Unified Booking Engine. Golden rule: every instant is timestamptz written in UTC;
-- IANA zone names exist only to expand weekly rules and to show guests their local time.
-- Synced external events are zero-knowledge: only hashed id, start, end, blocking flag.
create extension if not exists btree_gist;

create table if not exists public.booking_event_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  title text not null check (length(title) between 1 and 120),
  description text check (length(description) <= 2000),
  duration_minutes integer not null check (duration_minutes between 5 and 480 and duration_minutes % 5 = 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  minimum_notice_hours integer not null default 2 check (minimum_notice_hours between 0 and 720),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  slot_step_minutes integer not null default 15 check (slot_step_minutes in (15, 30, 60)),
  confirmation_mode text not null default 'instant' check (confirmation_mode in ('instant', 'request')),
  price_cents integer check (price_cents is null or price_cents >= 50),
  currency text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  stripe_price_id text,
  routing_strategy text not null default 'STRICT' check (routing_strategy in ('STRICT', 'ROUND_ROBIN', 'COLLECTIVE')),
  location_kind text not null default 'video' check (location_kind in ('video', 'address', 'phone')),
  location_value text check (length(location_value) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_event_types_one_owner check ((user_id is null) <> (workspace_id is null)),
  constraint booking_event_types_personal_strict check (workspace_id is not null or routing_strategy = 'STRICT')
);
create unique index if not exists booking_event_types_user_slug on public.booking_event_types (user_id, slug) where user_id is not null;
create unique index if not exists booking_event_types_ws_slug on public.booking_event_types (workspace_id, slug) where workspace_id is not null;

create table if not exists public.booking_event_type_hosts (
  event_type_id uuid not null references public.booking_event_types (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  priority integer not null default 0,
  primary key (event_type_id, user_id)
);
create index if not exists booking_event_type_hosts_user on public.booking_event_type_hosts (user_id);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  timezone text not null,
  check (end_minute > start_minute)
);
create index if not exists availability_rules_user on public.availability_rules (user_id);

create table if not exists public.availability_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  kind text not null check (kind in ('free', 'busy')),
  check (end_utc > start_utc)
);
create index if not exists availability_overrides_user on public.availability_overrides (user_id, start_utc);

create table if not exists public.connected_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  adapter text not null check (adapter in ('google', 'microsoft', 'caldav', 'ics')),
  label text check (length(label) <= 80),
  credentials_ciphertext text not null,
  credentials_iv text not null,
  sync_cursor text,
  webhook_channel_id text,
  webhook_expires_at timestamptz,
  last_synced_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'ok', 'error', 'disconnected')),
  last_error_code text,
  created_at timestamptz not null default now()
);
create index if not exists connected_calendars_user on public.connected_calendars (user_id);
create index if not exists connected_calendars_due on public.connected_calendars (adapter, last_synced_at nulls first) where sync_status <> 'disconnected';
create unique index if not exists connected_calendars_channel on public.connected_calendars (webhook_channel_id) where webhook_channel_id is not null;

create table if not exists public.calendar_events (
  id bigint generated always as identity primary key,
  calendar_id uuid not null references public.connected_calendars (id) on delete cascade,
  provider_id text not null check (provider_id ~ '^[0-9a-f]{64}$'),
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  is_blocking boolean not null default true,
  check (end_utc > start_utc),
  unique (calendar_id, provider_id)
);
create index if not exists calendar_events_window on public.calendar_events (calendar_id, start_utc);

create table if not exists public.availability_cache (
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null,
  free_bits bit(96) not null,
  version integer not null default 1,
  computed_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_type_id uuid not null references public.booking_event_types (id) on delete restrict,
  host_user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  group_id uuid,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  block_start_utc timestamptz not null,
  block_end_utc timestamptz not null,
  status text not null check (status in ('held', 'pending_payment', 'requested', 'confirmed', 'declined', 'cancelled')),
  guest_name text not null check (length(guest_name) between 1 and 120),
  guest_email text not null check (length(guest_email) <= 254),
  guest_timezone text not null,
  guest_note text check (length(guest_note) <= 2000),
  stripe_checkout_session_id text,
  hold_expires_at timestamptz,
  ics_uid text not null,
  sequence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_utc > start_utc and block_start_utc <= start_utc and block_end_utc >= end_utc)
);
do $$ begin
  alter table public.bookings add constraint bookings_no_overlap exclude using gist (
    host_user_id with =, tstzrange(block_start_utc, block_end_utc, '[)') with &&
  ) where (status in ('held', 'pending_payment', 'requested', 'confirmed'));
exception when duplicate_object or duplicate_table then null; end $$;
create index if not exists bookings_host_time on public.bookings (host_user_id, start_utc);
create index if not exists bookings_active on public.bookings (host_user_id, start_utc)
  where status in ('held', 'pending_payment', 'requested', 'confirmed');
create index if not exists bookings_hold_expiry on public.bookings (hold_expires_at) where status in ('held', 'pending_payment');
create unique index if not exists bookings_checkout on public.bookings (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

create table if not exists public.availability_jobs (
  user_id uuid primary key references public.users (id) on delete cascade,
  reason text not null,
  run_after timestamptz not null default now(),
  attempts integer not null default 0
);
create index if not exists availability_jobs_due on public.availability_jobs (run_after);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.booking_event_types, public.booking_event_type_hosts,
      public.availability_rules, public.availability_overrides, public.connected_calendars, public.calendar_events,
      public.availability_cache, public.bookings, public.availability_jobs to rout_app;
    grant usage on sequence public.calendar_events_id_seq to rout_app;
  end if;
end $$;
