-- Ambient weather: private latest city, hashed revocable webhook, durable 30-minute cache.
-- Apply once through scripts/migrate.ts with MIGRATION_URL; no runtime DDL.
create table if not exists public.ambient_weather_locations (
  user_id uuid primary key references public.users(id) on delete cascade,
  city text check (city is null or length(city) between 2 and 80),
  token_hash text unique,
  updated_at timestamptz not null default now()
);
create table if not exists public.ambient_weather_cache (
  city_key text primary key,
  state text check (state in ('Clear', 'Rain', 'Snow', 'Thunderstorm', 'Clouds/Fog')),
  checked_at timestamptz,
  refresh_after timestamptz not null default now()
);
grant select, insert, update, delete on public.ambient_weather_locations, public.ambient_weather_cache to rout_app;