-- Audit trail for linked platforms: when ownership was proven (method lives in verified_via: 'sso' | 'bio').
alter table public.user_integrations add column if not exists verified_at timestamptz;
update public.user_integrations set verified_at = updated_at where verified and verified_at is null;
