-- Transport metadata; historical deliveries stay unknown rather than fabricated.
alter table public.webhook_events add column if not exists direction text;
alter table public.webhook_events add column if not exists http_status integer;
create index if not exists webhook_events_created_id_idx on public.webhook_events (created_at desc, id desc);