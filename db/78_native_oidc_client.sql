-- 78 — Native "ROUT ID"-login: first-party OIDC-client voor onze eigen provider.
--
-- De "Keycloak / Self-hosted OIDC"-loginmethode werkt zonder externe sleutels:
-- zonder OIDC_*-configuratie gebruikt Better Auth onze eigen discovery-endpoint
-- met deze publieke PKCE-client (geen secret — de code-uitwisseling verloopt
-- met S256, dus er is niets te lekken). owner_user_id is null: dit is een
-- platform-client, geen lid-app.

alter table if exists public.oauth_clients alter column owner_user_id drop not null;

insert into public.oauth_clients
  (owner_user_id, client_id, secret_hash, name, description, redirect_uris, scopes, status, require_pkce)
values
  (null, 'rout_native_self', null, 'ROUT ID', 'First-party login via de eigen ROUT OIDC-provider.',
   array[
     'https://rout.be/api/auth/oauth2/callback/oidc',
     'https://www.rout.be/api/auth/oauth2/callback/oidc'
   ],
   array['openid', 'profile', 'email'], 'active', true)
on conflict (client_id) do nothing;
