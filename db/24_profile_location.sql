-- 24 — Approximate, GDPR-friendly session location on the profile.
--
-- Only a coarse country code + city name from the edge request headers is
-- stored (no IP address, no history), so support can spot obvious account
-- abuse without building a tracking log.

alter table public.profiles
  add column if not exists last_country text,
  add column if not exists last_city text,
  add column if not exists last_location_at timestamptz;
