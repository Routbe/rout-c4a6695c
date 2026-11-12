-- Intake fields per booking type + shared capacity (several guests in one slot).
alter table public.booking_event_types add column if not exists custom_fields jsonb not null default '[]'::jsonb;
alter table public.booking_event_types add column if not exists resource_capacity integer not null default 1;
do $$ begin
  alter table public.booking_event_types add constraint booking_event_types_capacity check (resource_capacity between 1 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.booking_event_types add constraint booking_event_types_custom_fields_array check (jsonb_typeof(custom_fields) = 'array' and jsonb_array_length(custom_fields) <= 20);
exception when duplicate_object then null; end $$;
alter table public.bookings add column if not exists intake_answers jsonb;
alter table public.bookings add column if not exists shared_slot boolean not null default false;
-- Shared-capacity bookings are counted by the booking transaction; the overlap guard covers the rest.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  host_user_id with =, tstzrange(block_start_utc, block_end_utc, '[)') with &&
) where (status in ('held', 'pending_payment', 'requested', 'confirmed') and not shared_slot);
create index if not exists bookings_shared_slot on public.bookings (event_type_id, start_utc) where shared_slot;
