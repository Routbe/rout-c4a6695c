-- 95 — YouTube vault: sealed OAuth tokens (youtube.readonly) on the
-- user_integrations row for provider 'youtube'. Tokens are AES-GCM sealed with
-- PSP_ENCRYPTION_KEY; youtube_card_json caches the public card for visitors.
alter table public.user_integrations
  add column if not exists access_token_enc  text,
  add column if not exists access_token_iv   text,
  add column if not exists refresh_token_enc text,
  add column if not exists refresh_token_iv  text,
  add column if not exists token_expires_at  timestamptz,
  add column if not exists connection_status text,
  add column if not exists youtube_card_json jsonb,
  add column if not exists youtube_card_at   timestamptz;
