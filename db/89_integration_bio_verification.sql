-- 89 — "Bio-check" ownership proof for open-web connections (Bluesky, W.social, Mastodon, GitHub).
-- `verified_via` records how `verified` was earned: 'sso' (linked sign-in) or 'bio' (code found in public bio).
alter table public.user_integrations add column if not exists verified_via text;
alter table public.user_integrations add column if not exists verify_code text;
alter table public.user_integrations add column if not exists verify_code_at timestamptz;
update public.user_integrations set verified_via = 'sso' where verified and verified_via is null;
