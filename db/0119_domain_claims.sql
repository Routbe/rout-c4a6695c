-- DNS-verifiable identity: a TXT record at _rout.<domain> unlocks the root handle <sld>.
-- Re-checked periodically; a failing record keeps the handle for a 30-day grace period.
create table public.domain_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  domain text not null check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'),
  handle text not null check (handle = lower(handle) and handle ~ '^[a-z0-9-]{2,40}$'),
  status text not null default 'pending' check (status in ('pending','verified','grace','released')),
  verified_at timestamptz,
  last_checked_at timestamptz,
  failing_since timestamptz,
  created_at timestamptz not null default now(),
  constraint domain_claims_domain_unique unique (domain),
  constraint domain_claims_grace check (status <> 'grace' or failing_since is not null)
);
-- One active owner per handle (pending claims may compete until one verifies).
create unique index domain_claims_active_handle on public.domain_claims (handle)
  where status in ('verified','grace');
create index domain_claims_user_idx on public.domain_claims (user_id);
create index domain_claims_recheck_idx on public.domain_claims (last_checked_at)
  where status in ('verified','grace');
grant select, insert, update, delete on public.domain_claims to rout_app;
alter table public.domain_claims enable row level security;
create policy domain_claims_owner on public.domain_claims to rout_app
using (user_id::text = current_setting('rout.user_id', true))
with check (user_id::text = current_setting('rout.user_id', true));

insert into public.badges (slug, name, description, icon, rarity)
select 'dns_verified', 'Domein geverifieerd', 'Eigenaarschap van een domeinnaam bewezen via DNS.', 'globe', 'rare'
where not exists (select 1 from public.badges where slug = 'dns_verified');
