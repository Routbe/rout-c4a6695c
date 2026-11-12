-- 34. Totaal bereik: gecachte som van volgeraantallen over alle sociale accounts.
--
-- De publieke profielpagina leest enkel `profiles.total_reach_count`; het
-- ophalen gebeurt in de achtergrond-cron (`/api/public/cron/sync-followers`)
-- of handmatig in de Studio.

alter table public.profiles
  add column if not exists show_total_reach boolean not null default false,
  add column if not exists total_reach_count integer not null default 0,
  add column if not exists reach_last_synced_at timestamptz,
  add column if not exists total_reach_manual integer;

alter table public.social_links
  add column if not exists auto_sync_enabled boolean not null default true;

alter table public.social_links
  alter column follower_count set default 0;

update public.social_links set follower_count = 0 where follower_count is null;

create index if not exists social_links_autosync_idx
  on public.social_links (auto_sync_enabled, last_synced_at);
