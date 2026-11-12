-- Dashboard aggregates: scope filters on tracked_qrs with recent-first ordering,
-- and allow the 'plus' tier as a stored workspace plan (entitlement engine already knows it).
create index if not exists tracked_qrs_workspace_created_idx on public.tracked_qrs (workspace_id, created_at desc)
  where workspace_id is not null;
create index if not exists tracked_qrs_personal_idx on public.tracked_qrs (user_id, created_at desc)
  where workspace_id is null;
create index if not exists qr_scans_qr_recent_idx on public.qr_scans (tracked_qr_id, scanned_at desc);

alter table public.workspaces drop constraint if exists workspaces_plan_check;
alter table public.workspaces add constraint workspaces_plan_check
  check (plan = any (array['free'::text, 'plus'::text, 'pro'::text, 'business'::text]));
