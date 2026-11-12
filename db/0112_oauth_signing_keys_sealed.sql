-- 0112 — Sealed signing keys for "Login met ROUT" (RFC-001 F8/F9).
-- Private keys are stored AES-256-GCM sealed (key per kid derived via HMAC from
-- ROUT_PROVIDER_SIGNING_KEK). The plaintext column stays readable for older
-- deployments until scripts/seal-signing-keys.ts retires the legacy key.

alter table public.oauth_signing_keys
  add column if not exists private_jwk_sealed text,
  add column if not exists private_jwk_iv text,
  add column if not exists kek_fingerprint text,
  add column if not exists alg text not null default 'ES256',
  add column if not exists revoked_at timestamptz;

alter table public.oauth_signing_keys alter column private_jwk drop not null;

alter table public.oauth_signing_keys drop constraint if exists oauth_signing_keys_private_part_check;
alter table public.oauth_signing_keys add constraint oauth_signing_keys_private_part_check check (
  -- never plaintext and sealed at the same time
  (private_jwk is null or private_jwk_sealed is null)
  -- sealed blob and iv always together
  and ((private_jwk_sealed is null) = (private_jwk_iv is null))
  -- a key that may still sign must have a private part
  and (retired_at is not null or revoked_at is not null or private_jwk is not null or private_jwk_sealed is not null)
);

alter table public.oauth_signing_keys drop constraint if exists oauth_signing_keys_alg_check;
alter table public.oauth_signing_keys add constraint oauth_signing_keys_alg_check check (alg = 'ES256');
