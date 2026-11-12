-- 0210 — Postgres regex repetition is capped at 255: express the shard
-- ciphertext bound as a length check instead of {22,400}. Idempotent.
alter table public.recovery_sealed_shards drop constraint if exists recovery_sealed_shards_ciphertext_check;
alter table public.recovery_sealed_shards add constraint recovery_sealed_shards_ciphertext_check
  check (char_length(ciphertext) <= 440 and ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$');
