-- 0140: atomic account merge.
-- rout_merge_assert raises inside the merge transaction so a failed guard rolls
-- back every statement of the batch (ticket claim, transfer, deletion).
create or replace function public.rout_merge_assert(ok boolean, reason text)
returns boolean language plpgsql immutable set search_path = public as $$
begin
  if not coalesce(ok, false) then
    raise exception '%', reason using errcode = 'P0001';
  end if;
  return true;
end
$$;
revoke all on function public.rout_merge_assert(boolean, text) from public;
grant execute on function public.rout_merge_assert(boolean, text) to rout_app;

-- Sign-in methods of the secondary account that collide with one the primary
-- already has (same provider) are archived here instead of failing a unique
-- index. No tokens or secrets are copied: only who/what/when for support.
create table if not exists public.merged_auth_account_archive (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null,
  secondary_auth_user_id text not null,
  provider_id text not null,
  provider_account_id text not null,
  original_created_at timestamptz,
  archived_at timestamptz not null default now()
);
create index if not exists merged_auth_account_archive_primary_idx
  on public.merged_auth_account_archive (primary_user_id);
alter table public.merged_auth_account_archive enable row level security;
revoke all on public.merged_auth_account_archive from public;
grant select, insert on public.merged_auth_account_archive to rout_app;
