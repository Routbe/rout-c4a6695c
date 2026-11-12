-- 23 — Three-tier subdomain infrastructure + Bluesky AT Protocol state.
--
--   free          → [alias].u.rout.be   (wildcard *.u.rout.be)
--   pro           → [handle].r.rout.be  (wildcard *.r.rout.be)
--   root_lifetime → [handle].rout.be    (manual DNS at Infomaniak, €39,99 once)

alter table public.profiles
  add column if not exists subdomain_alias text,
  add column if not exists subdomain_tier text not null default 'free',
  add column if not exists root_subdomain_status text not null default 'none',
  add column if not exists bluesky_handle text;

-- Constrain the two enum-ish columns (idempotent).
alter table public.profiles drop constraint if exists profiles_subdomain_tier_check;
alter table public.profiles
  add constraint profiles_subdomain_tier_check
  check (subdomain_tier in ('free', 'pro', 'root_lifetime'));

alter table public.profiles drop constraint if exists profiles_root_subdomain_status_check;
alter table public.profiles
  add constraint profiles_root_subdomain_status_check
  check (root_subdomain_status in ('none', 'pending_dns', 'active'));

-- Backfill: the alias mirrors the handle, verified members are Pro tier.
update public.profiles
   set subdomain_alias = coalesce(subdomain_alias, username)
 where subdomain_alias is null;

update public.profiles
   set subdomain_tier = 'pro'
 where verified is true and subdomain_tier = 'free';

create unique index if not exists profiles_subdomain_alias_key
  on public.profiles (lower(subdomain_alias))
  where subdomain_alias is not null;
