-- 86 — Wapenschilden & badge-details: soort, motto, verhaal, uitgever, accentkleur,
-- plus per toekenning een reden en volgorde. Idempotent.
alter table public.custom_badges add column if not exists kind text not null default 'crest';
alter table public.custom_badges add column if not exists motto text;
alter table public.custom_badges add column if not exists story text;
alter table public.custom_badges add column if not exists issuer_name text;
alter table public.custom_badges add column if not exists issuer_url text;
alter table public.custom_badges add column if not exists accent_color text;
alter table public.custom_badges add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'custom_badges_kind_chk') then
    alter table public.custom_badges add constraint custom_badges_kind_chk
      check (kind in ('crest', 'emblem', 'award', 'partner'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'custom_badges_accent_chk') then
    alter table public.custom_badges add constraint custom_badges_accent_chk
      check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'custom_badges_issuer_url_chk') then
    alter table public.custom_badges add constraint custom_badges_issuer_url_chk
      check (issuer_url is null or issuer_url ~ '^https://');
  end if;
end $$;

alter table public.user_custom_badges add column if not exists reason text;
alter table public.user_custom_badges add column if not exists sort_order int not null default 0;
