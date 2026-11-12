-- Both new and legacy grants stay private until explicit recipient opt-in.
alter table public.user_custom_badges add column if not exists show_on_name boolean not null default false;
alter table public.user_custom_badges add column if not exists show_in_badges boolean not null default false;
alter table public.user_custom_badges add column if not exists rejected_at timestamptz;
alter table public.user_custom_badges add column if not exists revoked_at timestamptz;
alter table public.custom_badges add column if not exists owner_user_id uuid;
alter table public.custom_badges add column if not exists workspace_id uuid;
alter table public.custom_badges drop constraint if exists custom_badges_kind_chk;
alter table public.custom_badges add constraint custom_badges_kind_chk check (kind in ('crest', 'emblem', 'award', 'partner', 'badge', 'certificate', 'diploma'));
create table if not exists public.credential_issuer_blocks (
  recipient_id uuid not null, issuer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (recipient_id, issuer_id)
);
create table if not exists public.credential_issue_requests (
  issuer_id uuid not null, request_key text not null,
  badge_id uuid not null references public.custom_badges(id) on delete cascade,
  recipient_id uuid not null, created_at timestamptz not null default now(),
  primary key (issuer_id, request_key)
);