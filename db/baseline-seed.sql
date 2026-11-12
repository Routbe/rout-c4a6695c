-- Reference rows the covered migrations (<= 110) inserted. Appended to 0000_baseline.sql.
insert into public.pricing_settings (id) values (1) on conflict (id) do nothing;

insert into public.promo_codes (code, label, percent_off, max_redemptions)
values ('EARLYBELIEVER', '100% korting', 100, 100)
on conflict (code) do nothing;

insert into public.badges (slug, name, description)
select 'influencer', 'De Influencer', '10 mensen uitgenodigd op ROUT.'
where not exists (select 1 from public.badges where slug = 'influencer');

insert into public.oauth_clients
  (owner_user_id, client_id, secret_hash, name, description, redirect_uris, scopes, status, require_pkce, publishing_status)
values
  (null, 'rout_native_self', null, 'ROUT ID', 'First-party login via de eigen ROUT OIDC-provider.',
   array[
     'https://rout.be/api/auth/oauth2/callback/oidc',
     'https://www.rout.be/api/auth/oauth2/callback/oidc'
   ],
   array['openid', 'profile', 'email'], 'active', true, 'production')
on conflict (client_id) do nothing;
