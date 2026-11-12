-- Historical rows are evidence inventory, not newly validated cryptographic proofs.
-- Keep login disabled and disputed until a session-bound reverification succeeds.
-- Unknown issuer or conflicting subjects stay in the legacy store for manual resolution.
insert into public.identity_links
  (user_id,provider,issuer,provider_sub,proof_method,proof_digest,step_up_method,step_up_at,status,created_at,last_verified_at)
select a."userId", a."providerId",
  case a."providerId" when 'google' then 'https://accounts.google.com' when 'github' then 'https://github.com'
    when 'apple' then 'https://appleid.apple.com' end,
  a."accountId", case when a."providerId" = 'github' then 'oauth_userinfo' else 'oidc_id_token' end,
  public.digest(convert_to(jsonb_build_object('source','neon_auth.account','id',a.id,'subject',a."accountId")::text,'UTF8'),'sha256'),
  'signup',a."createdAt",'disputed',a."createdAt",a."updatedAt"
from neon_auth.account a
where a."providerId" in ('google','github','apple')
  and length(a."accountId") > 0
  and (a."providerId" <> 'github' or a."accountId" ~ '^[0-9]+$')
  and not exists (select 1 from neon_auth.account b where b."providerId"=a."providerId" and b."accountId"=a."accountId" and b."userId"<>a."userId")
on conflict (issuer,provider_sub) do nothing;

-- AT identifiers have a global immutable subject; issuer-less Mastodon handles are not backfilled.
insert into public.identity_links
  (user_id,provider,issuer,provider_sub,display_handle,proof_method,proof_digest,step_up_method,step_up_at,status,created_at,last_verified_at)
select au.id,'bluesky','https://bsky.social',l.provider_account_id,l.handle,'atproto_oauth',
  public.digest(convert_to(jsonb_build_object('source','user_linked_accounts','id',l.id,'subject',l.provider_account_id)::text,'UTF8'),'sha256'),
  'signup',l.created_at,'disputed',l.created_at,l.last_checked_at
from public.user_linked_accounts l
join public.users u on u.id=l.user_id
join neon_auth."user" au on au.id::text=u.user_metadata->>'neon_auth_id'
where l.platform='bluesky' and l.provider_account_id ~ '^did:plc:[a-z2-7]{24}$'
  and not exists (select 1 from public.user_linked_accounts x where x.platform=l.platform and x.provider_account_id=l.provider_account_id and x.user_id<>l.user_id)
on conflict (issuer,provider_sub) do nothing;

insert into public.identity_link_events(link_id,user_id,event,actor,event_hash)
select id,user_id,'disputed','system',public.digest('backfill','sha256') from public.identity_links l
where not exists (select 1 from public.identity_link_events e where e.link_id=l.id);