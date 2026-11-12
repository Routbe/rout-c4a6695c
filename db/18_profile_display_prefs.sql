-- 18. Weergavevoorkeuren van het publieke profiel.
--
-- Eén JSON-kolom met badge-, watermerk-, achtergrond- en identiteitsopties, zodat
-- de studio nieuwe schakelaars kan toevoegen zonder telkens te migreren.
-- Vorm: {"identityMode","badgeVisible","badgeType","badgeNameFormat",
--        "showWatermark","backgroundStyle","typography"}

alter table public.profiles
  add column if not exists display_prefs jsonb not null default '{}'::jsonb;

comment on column public.profiles.display_prefs is
  'Publieke weergavevoorkeuren: badge (zichtbaarheid/type/naamopmaak), watermerk, achtergrondstijl, typografie en identiteitsmodus.';
