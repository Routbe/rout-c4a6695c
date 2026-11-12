-- 0131 — Two-tier identity (real human vs legal identity) + workspace tenancy fields.

-- 1. Tiered identities: explicit booleans + per-purpose nullifiers.
alter table public.verified_identities add column if not exists tier_1_real_human boolean not null default false;
alter table public.verified_identities add column if not exists tier_2_legal_identity boolean not null default false;
alter table public.verified_identities add column if not exists national_id_nullifier text;
alter table public.verified_identities add column if not exists provider_sub_nullifier text;

update public.verified_identities
   set tier_1_real_human = true,
       tier_2_legal_identity = (tier = 'tier_2_legal_identity')
 where tier_1_real_human = false;

-- One passport/eID can give the blue mark to exactly one account on the platform.
create unique index if not exists verified_identities_national_id_uniq
  on public.verified_identities (national_id_nullifier) where national_id_nullifier is not null;
-- One provider account (e.g. W Identity) links to exactly one ROUT account.
create unique index if not exists verified_identities_provider_sub_uniq
  on public.verified_identities (provider, provider_sub_nullifier) where provider_sub_nullifier is not null;
-- A legal tier always needs a national-id nullifier.
alter table public.verified_identities drop constraint if exists verified_identities_tier2_needs_nullifier;
alter table public.verified_identities add constraint verified_identities_tier2_needs_nullifier
  check (not tier_2_legal_identity or national_id_nullifier is not null) not valid;

-- 2. Early Believer grant date (shown in the Pioneer modal).
alter table public.profiles add column if not exists early_believer_at timestamptz;

-- 3. Workspace onboarding fields.
alter table public.workspaces add column if not exists description text;
alter table public.workspaces add column if not exists category text;
alter table public.workspaces drop constraint if exists workspaces_category_check;
alter table public.workspaces add constraint workspaces_category_check
  check (category is null or category in ('business', 'agency', 'nonprofit', 'event', 'project'));
alter table public.workspaces drop constraint if exists workspaces_description_len;
alter table public.workspaces add constraint workspaces_description_len
  check (description is null or char_length(description) <= 280);

-- 4. Viewer role for workspace members.
alter type public.workspace_role add value if not exists 'viewer';

-- 5. Scope column on remaining tenant data (null = personal).
alter table if exists public.links add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.api_keys add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
create index if not exists links_workspace_idx on public.links (workspace_id) where workspace_id is not null;
create index if not exists api_keys_workspace_idx on public.api_keys (workspace_id) where workspace_id is not null;
