-- 43 — Centrale publieke activiteit/mijlpalen (idempotent).
-- Bevat badges, certificaten, statuswijzigingen en mijlpalen zonder gevoelige
-- gegevens. Voorbereid op Bluesky/Mastodon (source + external_ref), zonder feeds.

create table if not exists public.public_activity (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  kind          text not null check (kind in ('badge','certificate','status','milestone','social_post','social_follow')),
  title         text not null check (char_length(title) <= 140),
  detail        text check (detail is null or char_length(detail) <= 280),
  payload       jsonb not null default '{}'::jsonb,
  visibility    text not null default 'public' check (visibility in ('public','private')),
  source        text not null default 'rout' check (source in ('rout','bluesky','mastodon')),
  external_ref  text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists public_activity_user_time_idx
  on public.public_activity (user_id, occurred_at desc);

create unique index if not exists public_activity_external_uidx
  on public.public_activity (source, external_ref)
  where external_ref is not null;

-- Voorbereiding: gekoppelde Fediverse/ATProto-accounts en volgers (nog niet gebruikt).
create table if not exists public.social_follow_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  network       text not null check (network in ('bluesky','mastodon')),
  remote_actor  text not null,
  direction     text not null check (direction in ('follower','following')),
  created_at    timestamptz not null default now(),
  unique (user_id, network, remote_actor, direction)
);
