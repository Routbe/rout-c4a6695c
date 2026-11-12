-- 83 — First-party platform OAuth clients (owner_user_id null, e.g. rout_native_self
-- for "ROUT ID"/Keycloak sign-in) are ROUT's own login, never in Developer Console
-- test mode. Idempotent.
update public.oauth_clients
   set publishing_status = 'production', status = 'active', updated_at = now()
 where (owner_user_id is null or client_id = 'rout_native_self')
   and (publishing_status is distinct from 'production' or status is distinct from 'active');
