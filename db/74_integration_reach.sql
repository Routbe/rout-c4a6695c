-- 74 — Total reach is computed from Connections Hub rows (user_integrations).
-- Open platforms are fetched automatically; others use a per-integration manual count.
alter table public.user_integrations
  add column if not exists include_in_reach boolean not null default true,
  add column if not exists follower_count integer,
  add column if not exists manual_follower_count integer check (manual_follower_count is null or manual_follower_count >= 0),
  add column if not exists reach_synced_at timestamptz;
