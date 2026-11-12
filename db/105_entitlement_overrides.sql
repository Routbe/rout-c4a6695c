-- Entitlement overrides per scope (user or workspace) + early-verified flag.
create table if not exists public.entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('user', 'workspace')),
  scope_id uuid not null,
  entitlement_key text not null,
  value text not null,
  granted_by text not null default 'system',
  created_at timestamptz not null default now()
);

create unique index if not exists entitlement_overrides_scope_key_uidx
  on public.entitlement_overrides (scope_type, scope_id, entitlement_key);

alter table public.profiles add column if not exists is_early_verified boolean not null default false;

-- Assets carry their scope: null = personal, otherwise the owning workspace.
alter table public.user_assets add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
create index if not exists user_assets_workspace_idx on public.user_assets (workspace_id);

-- Early-verified promotion: every path that sets verified = true grants it once.
create or replace function public.grant_early_verified_promo() returns trigger language plpgsql as $$
begin
  if new.verified and not coalesce(old.verified, false) then
    new.is_early_verified := true;
    insert into public.entitlement_overrides (scope_type, scope_id, entitlement_key, value, granted_by)
    values ('user', new.id, 'PRO_FOR_LIFE', 'true', 'early_verified_promo'),
           ('user', new.id, 'INCLUDED_PLUS_WORKSPACE', '1', 'early_verified_promo')
    on conflict (scope_type, scope_id, entitlement_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_early_verified_promo on public.profiles;
create trigger profiles_early_verified_promo before update of verified on public.profiles
  for each row execute function public.grant_early_verified_promo();
