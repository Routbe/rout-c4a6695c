-- 72 — 6-cijferige inlogcode naast de magic link (zelfde mail, 15 min, eenmalig).
-- Alleen hashes van e-mail en code; de link wordt bij gebruik meteen gewist.
create table if not exists public.login_codes (
  id          bigserial primary key,
  email_hash  text not null,
  code_hash   text not null,
  link        text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists login_codes_lookup_idx on public.login_codes (email_hash, code_hash);
create index if not exists login_codes_expiry_idx on public.login_codes (expires_at);

grant select, insert, update, delete on public.login_codes to rout_app;
grant usage, select on sequence public.login_codes_id_seq to rout_app;
