-- ARCHIVED 2026-11-12 — never run. Superseded by the vault enclave (db/0221) and 2-of-3 recovery;
-- its passkey/recovery key wraps belonged to the deprecated 3-of-5 recovery vault.
-- Kept outside db/ so no migration runner can pick it up.
-- E2EE hybrid schema. Apply ONLY to the Neon branch 'feat-e2e-encryption' first; never auto-applied.
-- Blind columns hold client-side AES-256-GCM ciphertext ("v1.<iv>.<ct>"); the server cannot read them.
-- Public profile fields (handle, name, avatar, bio) stay readable but get a DID-signed JWS.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS did_jwk text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_profile_jws text,
  ADD COLUMN IF NOT EXISTS encrypted_blob text CHECK (encrypted_blob IS NULL OR encrypted_blob ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$'),
  ADD COLUMN IF NOT EXISTS e2ee_migrated_at timestamptz;

-- Wrapped DEKs: one row per passkey (PRF) plus the recovery master key. Only wrapped bytes stored.
CREATE TABLE IF NOT EXISTS e2ee_key_wraps (
  user_id text NOT NULL,
  wrap_id text NOT NULL,           -- passkey credential id, or 'recovery'
  wrapped_dek text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wrap_id)
);
