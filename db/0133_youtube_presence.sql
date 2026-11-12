-- YouTube live presence pushed by the PubSubHubbub hub (no polling).
alter table public.user_integrations add column if not exists youtube_presence jsonb;
alter table public.user_integrations add column if not exists youtube_presence_at timestamptz;
