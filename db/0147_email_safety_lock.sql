create table if not exists public.account_email_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  old_email text not null,
  new_email text not null,
  confirm_token_hash text not null unique,
  freeze_token_hash text not null unique,
  created_at timestamptz not null default now(),
  recovery_until timestamptz not null default now() + interval '48 hours',
  warning_sent_at timestamptz,
  confirmed_at timestamptz,
  frozen_at timestamptz
);
grant select, insert, update on public.account_email_changes to rout_app;
alter table public.account_email_changes enable row level security;
create policy email_changes_owner on public.account_email_changes
  using (user_id = public.rout_current_user_id()) with check (user_id = public.rout_current_user_id());
create index email_safety_owner on public.account_email_changes(user_id,recovery_until);
-- Only a high-entropy hashed token can identify an owner outside the normal session policy.
create or replace function public.email_freeze_owner(token_hash text) returns uuid
language sql stable security definer set search_path=public as $$
  select user_id from public.account_email_changes where freeze_token_hash=token_hash and recovery_until>now() and frozen_at is null limit 1
$$;
revoke all on function public.email_freeze_owner(text) from public;
grant execute on function public.email_freeze_owner(text) to rout_app;
-- Old address remains reserved for recovery; ordinary signup cannot steal it during the lock.
create or replace function public.reserve_recovery_email() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.account_email_changes c where lower(c.old_email)=lower(new.email)
      and c.user_id<>new.id and c.recovery_until>now()) then
    raise exception 'email_reserved_for_recovery';
  end if;
  return new;
end $$;
create trigger reserve_recovery_email before insert or update of email on public.users for each row execute function public.reserve_recovery_email();