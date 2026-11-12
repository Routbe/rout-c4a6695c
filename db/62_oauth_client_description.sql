-- 62 — Korte beschrijving voor apps in de Developer Console (wizard stap 1).
alter table if exists public.oauth_clients add column if not exists description text;
