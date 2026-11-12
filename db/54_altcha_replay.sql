-- 54 — ALTCHA replay protection: every accepted proof signature is stored once. Idempotent.
create table if not exists public.altcha_used (
  signature text primary key,
  expires_at timestamptz not null
);
create index if not exists altcha_used_expires_idx on public.altcha_used (expires_at);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, delete on public.altcha_used to rout_app;
  end if;
end $$;
