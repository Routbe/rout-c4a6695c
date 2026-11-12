-- 57 — Eigen badges (familiewapens, bedrijfslogo's), uitgereikt door een admin.
-- Additief: staan naast het blauwe vinkje of privacyschild, vervangen ze nooit. Idempotent.
create table if not exists public.custom_badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  image_url   text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_custom_badges (
  user_id    uuid not null,
  badge_id   uuid not null references public.custom_badges(id) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index if not exists user_custom_badges_badge_idx on public.user_custom_badges (badge_id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.custom_badges to rout_app;
    grant select, insert, update, delete on public.user_custom_badges to rout_app;
  end if;
end $$;
