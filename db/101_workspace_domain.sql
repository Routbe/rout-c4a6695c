-- 101 — Verified website domain for business workspaces (set by an admin).
alter table public.workspaces add column if not exists domain text;
alter table public.workspaces add column if not exists domain_verified_at timestamptz;
