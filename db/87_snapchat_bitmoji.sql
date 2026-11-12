-- 87 — Snapchat (Snap Kit Login Kit + Bitmoji Kit). No location data ever.
-- Stores the linked Snap identity, chosen Bitmoji and a manual mood/status.
create table if not exists public.user_snapchat (
  user_id         uuid primary key references public.users(id) on delete cascade,
  external_id     text not null,
  display_name    text,
  bitmoji_url     text,
  mood_emoji      text check (mood_emoji is null or char_length(mood_emoji) <= 16),
  mood_text       text check (mood_text is null or char_length(mood_text) <= 60),
  show_card       boolean not null default false,
  show_mood       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists user_snapchat_external_idx on public.user_snapchat (external_id);
grant select, insert, update, delete on public.user_snapchat to rout_app;
