-- 61 — Klikmetingen per link op publieke profielen.
-- Privacyvriendelijk: geen cookies, geen IP; alleen dag-gebonden bezoekershash.
create table if not exists public.profile_link_clicks (
  id              bigserial primary key,
  profile_user_id uuid references public.profiles(id) on delete cascade,
  handle          text not null,
  block_id        text not null,
  label           text,
  space           text not null default 'alias' check (space in ('root', 'alias')),
  visitor_hash    text,
  created_at      timestamptz not null default now()
);
create index if not exists profile_link_clicks_user_time_idx
  on public.profile_link_clicks (profile_user_id, created_at desc);
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert on public.profile_link_clicks to rout_app;
    grant usage on sequence public.profile_link_clicks_id_seq to rout_app;
  end if;
end $$;
