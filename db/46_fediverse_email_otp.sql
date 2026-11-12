-- 46. E-mailcode voor Bluesky/Mastodon-aanmelding zonder geverifieerd e-mailadres.
-- Een Fediverse-account wordt pas aan een e-mailadres gekoppeld nadat de
-- eigenaar van dat adres de 6-cijferige code heeft ingevoerd. Idempotent.

create table if not exists public.fediverse_email_otp (
  pending_key   text primary key,          -- sha256 van de ondertekende aanmelding
  email         text not null,
  code_hash     text not null,             -- sha256(pending_key|email|code)
  attempts      integer not null default 0,
  locked_until  timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists fediverse_email_otp_expires_idx
  on public.fediverse_email_otp (expires_at);
