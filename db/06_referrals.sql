-- Referral graph + gamification counters (idempotent).

alter table public.profiles add column if not exists referred_by uuid;
alter table public.profiles add column if not exists invited_count integer not null default 0;
alter table public.profiles add column if not exists verified_invites integer not null default 0;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null,
  invitee_id uuid not null unique,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists referrals_inviter_idx on public.referrals (inviter_id);

insert into public.badges (slug, name, description)
select 'influencer', 'De Influencer', '10 mensen uitgenodigd op ROUT.'
where not exists (select 1 from public.badges where slug = 'influencer');
