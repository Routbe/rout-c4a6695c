-- 49. Eenmalige beheerder-bootstrap.
-- Alleen een SHA-256-digest wordt opgeslagen; de token zelf blijft uitsluitend
-- in ADMIN_BOOTSTRAP_TOKEN. Eén digest kan atomair maar één keer worden gebruikt.

create table if not exists public.admin_bootstrap_tokens (
  token_hash  text primary key,
  consumed_by uuid not null references public.users(id) on delete restrict,
  consumed_at timestamptz not null default now()
);

grant all on public.admin_bootstrap_tokens to service_role;