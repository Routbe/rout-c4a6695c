-- 0212: ROUT card lifecycle. Freeze stays reversible; "blocked" is permanent
-- (lost/stolen, or replaced). A replacement bumps the member's card generation,
-- so the root card number, pass serial and wallet key id all change at once.
-- Run as the database owner (not rout_app): rout_app must own no tables.

alter table public.card_freezes add column if not exists blocked boolean not null default false;
alter table public.card_freezes add column if not exists reason text check (reason is null or reason in ('lost', 'stolen', 'replaced', 'other'));

-- A blocked serial can never be thawed, not even by its owner.
drop policy if exists card_freezes_delete_own on public.card_freezes;
create policy card_freezes_delete_own on public.card_freezes for delete
  using (user_id = public.rout_current_user_id() and not blocked);
-- Owners may only turn a freeze into a block, never back.
drop policy if exists card_freezes_update_own on public.card_freezes;
create policy card_freezes_update_own on public.card_freezes for update
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id() and blocked);

create table if not exists public.rout_card_generations (
  user_id uuid primary key,
  generation integer not null default 0 check (generation >= 0 and generation < 1000),
  replaced_at timestamptz not null default now()
);
alter table public.rout_card_generations enable row level security;
drop policy if exists rout_card_generations_select_own on public.rout_card_generations;
create policy rout_card_generations_select_own on public.rout_card_generations for select
  using (user_id = public.rout_current_user_id());
drop policy if exists rout_card_generations_insert_own on public.rout_card_generations;
create policy rout_card_generations_insert_own on public.rout_card_generations for insert
  with check (user_id = public.rout_current_user_id());
drop policy if exists rout_card_generations_update_own on public.rout_card_generations;
create policy rout_card_generations_update_own on public.rout_card_generations for update
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());

-- Public card builds need the generation without seeing other rows.
create or replace function public.rout_card_generation(u uuid) returns integer
  language sql stable security definer set search_path to 'public'
as $$ select coalesce((select generation from public.rout_card_generations where user_id = u), 0) $$;
revoke all on function public.rout_card_generation(uuid) from public;

create or replace function public.rout_card_status_by_serial(s text) returns text
  language sql stable security definer set search_path to 'public'
as $$
  select case
    when exists(select 1 from public.card_freezes where serial = s and blocked) then 'blocked'
    when exists(select 1 from public.card_freezes where serial = s) then 'frozen'
    when exists(select 1 from public.physical_keys where card_serial = s and status <> 'active') then 'frozen'
    else 'active' end
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant update (blocked, reason) on public.card_freezes to rout_app;
    grant select, insert, update on public.rout_card_generations to rout_app;
    grant execute on function public.rout_card_generation(uuid) to rout_app;
    grant execute on function public.rout_card_status_by_serial(text) to rout_app;
  end if;
end $$;
