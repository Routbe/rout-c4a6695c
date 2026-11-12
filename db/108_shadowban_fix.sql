-- Delta for 91_shadowban.sql (never edit an applied migration). Column already exists live;
-- this adds the moderation lookup index and re-asserts the column idempotently.
alter table if exists public.profiles add column if not exists is_shadowbanned boolean not null default false;
create index if not exists profiles_shadowbanned_idx on public.profiles (id) where is_shadowbanned;
