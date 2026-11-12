-- Self-service hard delete with a 7-day grace period and a signed, append-only audit trail.
alter table public.users drop constraint users_account_status_check;
alter table public.users add constraint users_account_status_check
  check (account_status in ('active', 'migrated_sunset', 'retired', 'pending_deletion'));

-- No FK to users: the row must outlive the purge (user id kept only as a hash after completion).
create table public.account_deletions (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint account_deletions_grace check (purge_after >= requested_at + interval '7 days')
);
grant select, insert, update on public.account_deletions to rout_app;
alter table public.account_deletions enable row level security;
create policy account_deletions_owner on public.account_deletions to rout_app
using (user_id::text = current_setting('rout.user_id', true))
with check (user_id::text = current_setting('rout.user_id', true));
create index account_deletions_due_idx on public.account_deletions (purge_after)
  where cancelled_at is null and completed_at is null;

create table public.account_deletion_audit (
  id bigint generated always as identity primary key,
  user_id_hash bytea not null check (octet_length(user_id_hash) = 32),
  event text not null check (event in ('requested','cancelled','purged')),
  signature bytea not null check (octet_length(signature) = 32),
  created_at timestamptz not null default now()
);
grant select, insert on public.account_deletion_audit to rout_app;
grant usage, select on sequence public.account_deletion_audit_id_seq to rout_app;
alter table public.account_deletion_audit enable row level security;
create policy account_deletion_audit_insert on public.account_deletion_audit for insert to rout_app with check (true);

create function public.account_deletion_audit_append_only() returns trigger
language plpgsql as $$ begin raise exception 'account_deletion_audit_append_only'; end $$;
revoke all on function public.account_deletion_audit_append_only() from public;
create trigger account_deletion_audit_immutable before update or delete on public.account_deletion_audit
for each row execute function public.account_deletion_audit_append_only();

-- A deleted admin must not block account purges through brand-release history.
alter table public.reserved_brand_releases alter column released_by drop not null;
alter table public.reserved_brand_releases drop constraint reserved_brand_releases_released_by_fkey;
alter table public.reserved_brand_releases add constraint reserved_brand_releases_released_by_fkey
  foreign key (released_by) references public.users(id) on delete set null;
