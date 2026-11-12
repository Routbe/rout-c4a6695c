-- Universal Handle Sync: per-app opt-in to receive the member's @handle as `rout_handle`.
alter table public.oauth_clients add column if not exists handle_sync_enabled boolean not null default false;
