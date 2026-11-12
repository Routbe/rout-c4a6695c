-- 0173 — Sovereign calendars: a calendar is its own entity, not part of the
-- profile schema. Two modes:
--   linked    → public at rout.be/u/<username>/agenda (tied to the owner's identity)
--   sovereign → public at rout.be/a/<public_id> (unguessable, never reveals the owner)
-- Bookings keep flowing through booking_event_types; a calendar points at one.
-- Idempotent.

create table if not exists public.rout_calendars (
  id             uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.users (id) on delete cascade,
  workspace_id   uuid references public.workspaces (id) on delete cascade,
  mode           text not null default 'linked',
  public_id      text not null,
  title          text not null,
  description    text,
  event_type_id  uuid references public.booking_event_types (id) on delete set null,
  is_active      boolean not null default true,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rout_calendars_mode_check check (mode in ('linked', 'sovereign')),
  constraint rout_calendars_public_id_check check (public_id ~ '^[A-Za-z0-9_-]{12,32}$'),
  constraint rout_calendars_title_check check (char_length(title) between 1 and 120)
);
create unique index if not exists rout_calendars_public_id on public.rout_calendars (public_id);
create index if not exists rout_calendars_user on public.rout_calendars (user_id);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke all on public.rout_calendars from rout_app;
    grant select, insert, update, delete on public.rout_calendars to rout_app;
  end if;
end $$;
revoke all on public.rout_calendars from public;

alter table public.rout_calendars enable row level security;
drop policy if exists rout_owner_all on public.rout_calendars;
create policy rout_owner_all on public.rout_calendars
  for all using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());

-- Public lookup for /a/<public_id>: returns only what a visitor needs, never
-- the owner id, so a sovereign page stays untraceable.
create or replace function public.rout_public_calendar(p_public_id text)
returns table(title text, description text, event_type_id uuid)
language sql stable security definer set search_path = public
as $$
  select c.title, c.description, c.event_type_id
    from public.rout_calendars c
   where c.public_id = p_public_id
     and c.is_active
     and (c.expires_at is null or c.expires_at > now())
   limit 1
$$;
revoke all on function public.rout_public_calendar(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant execute on function public.rout_public_calendar(text) to rout_app;
  end if;
end $$;
