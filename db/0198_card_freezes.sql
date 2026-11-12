-- 0198: "Freeze" for the ROUT Card. A frozen serial makes every secure QR and
-- live code of that card invalid until the owner unfreezes it.
-- Run as the database owner (not rout_app): rout_app must own no tables.
create table if not exists public.card_freezes (
  serial text primary key check (serial ~ '^[\w.-]{8,128}$'),
  user_id uuid not null,
  frozen_at timestamptz not null default now()
);
alter table public.card_freezes enable row level security;

drop policy if exists card_freezes_select_own on public.card_freezes;
create policy card_freezes_select_own on public.card_freezes for select
  using (user_id = public.rout_current_user_id());
drop policy if exists card_freezes_insert_own on public.card_freezes;
create policy card_freezes_insert_own on public.card_freezes for insert
  with check (user_id = public.rout_current_user_id());
drop policy if exists card_freezes_delete_own on public.card_freezes;
create policy card_freezes_delete_own on public.card_freezes for delete
  using (user_id = public.rout_current_user_id());

-- Public check reveals only a boolean, never who owns the card.
create or replace function public.rout_card_frozen(s text) returns boolean
  language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.card_freezes where serial = s) $$;
revoke all on function public.rout_card_frozen(text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke update, truncate on public.card_freezes from rout_app;
    grant select, insert, delete on public.card_freezes to rout_app;
    grant execute on function public.rout_card_frozen(text) to rout_app;
  end if;
end $$;
