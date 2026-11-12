-- 64 — Gedeelde limieten (vast tijdvenster) over alle servers heen.
-- bucket = "<regel>:<sha256 van onderwerp>" — geen ruwe IP's of nummers.
create table if not exists public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

grant select, insert, update, delete on public.rate_limits to rout_app;
