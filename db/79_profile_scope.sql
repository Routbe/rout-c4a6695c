-- 79 — Per-profile scope for integrations and Live Presence: each connection
-- chooses independently whether it shows on the Verified profile and/or the
-- Privacy Alias. Default keeps today's behaviour (both).
alter table public.user_integrations
  add column if not exists show_on_verified boolean not null default true,
  add column if not exists show_on_alias    boolean not null default true;
alter table public.user_presence_connections
  add column if not exists show_on_verified boolean not null default true,
  add column if not exists show_on_alias    boolean not null default true;
