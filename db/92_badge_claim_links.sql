-- 92 — Claim-a-Stamp: admin-generated claim links (QR in the real world) that grant a badge
-- to the signed-in member who opens them. Optional max claims and expiry. Idempotent.
create table if not exists public.badge_claim_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  badge_id     uuid not null references public.custom_badges(id) on delete cascade,
  reason       text,
  max_claims   integer,
  claims_count integer not null default 0,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  constraint badge_claim_links_token_chk check (token ~ '^stamp_[a-z0-9]{8,32}$'),
  constraint badge_claim_links_max_chk check (max_claims is null or max_claims between 1 and 100000)
);
create index if not exists badge_claim_links_badge_idx on public.badge_claim_links (badge_id);

create table if not exists public.badge_claim_redemptions (
  link_id    uuid not null references public.badge_claim_links(id) on delete cascade,
  user_id    uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (link_id, user_id)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.badge_claim_links to rout_app;
    grant select, insert, update, delete on public.badge_claim_redemptions to rout_app;
  end if;
end $$;
