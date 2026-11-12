-- 0136: per-app email choice for "Login met ROUT".
-- Stores the SOURCE (primary or a verified alias), so changing the primary email
-- automatically updates every app that follows the primary address.
create table if not exists public.app_email_assignments (
  user_id uuid not null,
  client_id text not null check (char_length(client_id) between 1 and 200),
  source text not null check (source in ('primary', 'alias')),
  alias_id uuid,
  assigned_email text not null check (char_length(assigned_email) between 3 and 320),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id),
  check ((source = 'alias') = (alias_id is not null))
);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.app_email_assignments to rout_app;
  end if;
end $$;

alter table public.app_email_assignments enable row level security;
drop policy if exists rout_scope on public.app_email_assignments;
create policy rout_scope on public.app_email_assignments
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());
