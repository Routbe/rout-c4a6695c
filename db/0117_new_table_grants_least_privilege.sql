-- Live default privileges gave rout_app full DML on tables from 0113-0116.
-- Reset to exactly the grants those migrations declare (immutable files stay untouched).
revoke all on public.identity_links, public.identity_link_events, public.oauth_refresh_tokens,
  public.oauth_access_tokens, public.reserved_brands, public.reserved_brand_releases from rout_app;
grant select, insert, update on public.identity_links to rout_app;
grant select, insert on public.identity_link_events to rout_app;
grant select, insert, update on public.oauth_refresh_tokens to rout_app;
grant select, insert, update on public.oauth_access_tokens to rout_app;
grant select on public.reserved_brands to rout_app;
grant select, insert on public.reserved_brand_releases to rout_app;
