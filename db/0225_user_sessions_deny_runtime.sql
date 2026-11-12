-- 0225: user_sessions back to deny-by-default for rout_app.
--
-- 0223 made user_sessions owner-only. The reviewed model is stricter: this
-- legacy table (sign-in sessions live in neon_auth.session) is a secret table
-- that only the non-login merge executor may touch (workspace-scope-hardening
-- test). Runtime reads now return no rows and the sunset scrub deletes none;
-- rows still go with the member through the users foreign key cascade.
drop policy if exists rout_owner on public.user_sessions;
drop policy if exists rout_server on public.user_sessions;
