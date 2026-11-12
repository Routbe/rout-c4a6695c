-- Shadowban: member keeps using ROUT, but their contributions are hidden from others server-side.
alter table if exists public.profiles add column if not exists is_shadowbanned boolean not null default false;
