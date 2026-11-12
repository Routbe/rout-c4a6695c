-- 85 — Cached Spotify playback state per member. Public reads hit this cache;
-- Spotify is only called when the row is older than a few seconds.
create table if not exists public.user_music_status (
  user_id        uuid primary key references public.users(id) on delete cascade,
  is_playing     boolean not null default false,
  track_name     text,
  artist_name    text,
  album_art_url  text,
  external_url   text,
  progress_ms    integer,
  duration_ms    integer,
  sync_timestamp timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.user_music_status to rout_app;
  end if;
end $$;
