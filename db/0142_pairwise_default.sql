-- 0142: uniform pairwise subject rollout.
-- New clients already default to subject_type 'pairwise' (db/0115). Legacy
-- clients keep 'public' until their owner explicitly opts in via
-- upgradeClientToPairwise (one-way, step-up protected). This backfill derives
-- the missing sector_id from the first registered redirect URI so that opt-in
-- never fails on missing data. Idempotent: rows with a sector stay untouched.
update public.oauth_clients
set sector_id = lower(split_part(split_part(regexp_replace(redirect_uris[1], '^https?://', ''), '/', 1), ':', 1))
where sector_id is null
  and cardinality(redirect_uris) > 0
  and redirect_uris[1] ~ '^https?://[^/]+';
