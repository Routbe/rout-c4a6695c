-- ---------------------------------------------------------------------------
-- E-mail sign-in with a 6-digit code.
--
-- The code lives in the same one-time-token table as magic links, under its own
-- purpose. Only a SHA-256 digest of `<user_id>:<code>` is stored, so two members
-- can hold the same six digits without colliding on the unique token_hash.
-- ---------------------------------------------------------------------------

alter table public.auth_tokens drop constraint if exists auth_tokens_purpose_check;

alter table public.auth_tokens
  add constraint auth_tokens_purpose_check
  check (purpose in ('magic_link', 'password_reset', 'email_confirm', 'email_change', 'email_code'));
