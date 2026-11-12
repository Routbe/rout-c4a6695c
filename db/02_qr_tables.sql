-- The hand-created tracked_qrs/qr_scans tables in Neon predate the full
-- schema. Both are empty, so recreate them exactly as the migrations define
-- them (short links, dashboard tokens, scan metadata).

drop table if exists public.qr_scans cascade;
drop table if exists public.tracked_qrs cascade;

create table public.tracked_qrs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  slug text not null unique,
  dashboard_token text not null unique,
  kind text not null default 'qr',
  label text,
  target_type text not null,
  target_url text not null,
  custom_domain text,
  short_link_enabled boolean not null default false,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  tracked_qr_id uuid not null references public.tracked_qrs (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  country text,
  device text,
  browser text,
  os text,
  user_agent text
);

create index if not exists tracked_qrs_user_idx on public.tracked_qrs (user_id);
create index if not exists qr_scans_qr_idx on public.qr_scans (tracked_qr_id, scanned_at);

grant select, insert, update, delete on public.tracked_qrs to authenticated;
grant select, insert, update, delete on public.qr_scans to authenticated;
grant all on public.tracked_qrs to service_role;
grant all on public.qr_scans to service_role;

-- Role referenced by a GRANT/REVOKE in one of the migrations.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    create role sandbox_exec nologin noinherit;
  end if;
end
$$;
