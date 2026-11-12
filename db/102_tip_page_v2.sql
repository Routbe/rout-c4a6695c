-- 102 — Steunpagina v2: betaalmethodes (volgorde/aan-uit), externe links, sociale fotobron, max 6 foto's. Idempotent.
alter table public.tip_settings add column if not exists methods jsonb not null default '[]'::jsonb;
alter table public.tip_settings add column if not exists external_links jsonb not null default '[]'::jsonb;
alter table public.tip_settings add column if not exists social_source jsonb;
alter table public.tip_settings drop constraint if exists tip_settings_images_max;
alter table public.tip_settings add constraint tip_settings_images_max check (coalesce(array_length(image_urls, 1), 0) <= 6);
alter table public.psp_credentials add column if not exists publishable_key text;
