-- Aligns the pre-existing Neon tables with the schema the migrations expect,
-- and completes the Supabase stand-ins (auth.users columns, storage helpers).

-- auth.users columns referenced by triggers/views in the migrations.
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;
alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists updated_at timestamptz not null default now();

-- storage.foldername() is used by storage RLS policies.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;

-- profiles: add every column from the baseline migration that is missing on
-- the hand-created Neon table.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists preferred_language text;
alter table public.profiles add column if not exists business_info jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists is_early_believer boolean not null default false;
alter table public.profiles add column if not exists is_paid boolean not null default false;
alter table public.profiles add column if not exists subdomain_enabled boolean not null default false;
alter table public.profiles add column if not exists custom_domain text;
alter table public.profiles add column if not exists bluesky_did text;
alter table public.profiles add column if not exists redirect_target text not null default 'hub';
alter table public.profiles add column if not exists show_email_publicly boolean not null default false;
alter table public.profiles add column if not exists forwarding_email text;
alter table public.profiles add column if not exists forwarding_email_token text;
alter table public.profiles add column if not exists forwarding_email_token_expires_at timestamptz;
alter table public.profiles add column if not exists forwarding_email_verified boolean not null default false;
alter table public.profiles add column if not exists handle_grant text;
alter table public.profiles add column if not exists payment_method text;
alter table public.profiles add column if not exists moderated_at timestamptz;
alter table public.profiles add column if not exists moderated_by uuid;
alter table public.profiles add column if not exists moderation_reason text;
alter table public.profiles add column if not exists alias_status text not null default 'none';
alter table public.profiles add column if not exists alias_sync_status text not null default 'idle';
alter table public.profiles add column if not exists alias_sync_attempts integer not null default 0;
alter table public.profiles add column if not exists alias_sync_error text;
alter table public.profiles add column if not exists alias_synced_at timestamptz;
alter table public.profiles add column if not exists referred_by uuid;
alter table public.profiles add column if not exists referral_count integer not null default 0;
alter table public.profiles add column if not exists url_style text not null default 'u_at';

-- tracked_qrs / qr_scans: columns added by later migrations.
alter table public.tracked_qrs add column if not exists slug text;
alter table public.tracked_qrs add column if not exists target_url text;
alter table public.tracked_qrs add column if not exists is_active boolean not null default true;
alter table public.tracked_qrs add column if not exists updated_at timestamptz not null default now();
alter table public.qr_scans add column if not exists country text;
alter table public.qr_scans add column if not exists user_agent_family text;
