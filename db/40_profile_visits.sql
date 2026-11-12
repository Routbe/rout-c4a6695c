-- 40 — Bezoekregistratie voor publieke profielen (root én alias).
--
-- Privacyvriendelijk: geen cookies, geen IP-opslag. Per bezoek bewaren we een
-- dag-gebonden hash (ip + user-agent + dag + salt) zodat we unieke bezoekers
-- kunnen tellen zonder iemand over dagen heen te volgen.

create table if not exists public.profile_visits (
  id              bigserial primary key,
  profile_user_id uuid references public.profiles(id) on delete cascade,
  handle          text not null,
  -- 'root'  → rout.be/<naam>      (geverifieerd profiel)
  -- 'alias' → rout.be/u/<naam>    (gratis aliasprofiel)
  space           text not null default 'alias' check (space in ('root', 'alias')),
  path            text,
  locale          text,
  country         text,
  device          text,
  visitor_hash    text,
  created_at      timestamptz not null default now()
);

create index if not exists profile_visits_user_time_idx
  on public.profile_visits (profile_user_id, created_at desc);

create index if not exists profile_visits_handle_time_idx
  on public.profile_visits (lower(handle), created_at desc);

create index if not exists profile_visits_space_idx
  on public.profile_visits (space, created_at desc);
