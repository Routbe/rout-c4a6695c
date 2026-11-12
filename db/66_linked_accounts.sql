-- 66 — Social accounts verified via official login, AT Protocol or a posted code.
create table if not exists public.user_linked_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  platform            text not null,
  provider_account_id text not null,
  handle              text,
  status              text not null default 'verified' check (status in ('pending', 'verified', 'revoked')),
  method              text not null check (method in ('oauth', 'atproto', 'code')),
  token_enc           text,
  scopes              text[] not null default '{}',
  last_checked_at     timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (platform, provider_account_id)
);
create index if not exists user_linked_accounts_user_idx on public.user_linked_accounts (user_id);

grant select, insert, update, delete on public.user_linked_accounts to rout_app;
