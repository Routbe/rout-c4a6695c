-- 107 — Public workspace pages (rout.be/w/<slug>) and the corrected slug rule.
-- Slug: min 3, max 40, lowercase a-z / 0-9 / hyphens, no reserved system words.
alter table public.workspaces drop constraint if exists workspaces_slug_check;
alter table public.workspaces add constraint workspaces_slug_check check (
  char_length(slug) between 3 and 40
  and slug ~ '^[a-z0-9-]+$'
  and slug not in ('admin', 'api', 'auth', 'u', 'w', 'studio', 'settings', 'rout')
) not valid;


-- Scope columns for the remaining data features (personal = workspace_id is null).
alter table if exists public.link_clicks add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table if exists public.profile_visits add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
do $$ begin
  if to_regclass('public.link_clicks') is not null then
    create index if not exists link_clicks_workspace_idx on public.link_clicks (workspace_id) where workspace_id is not null;
  end if;
  if to_regclass('public.profile_visits') is not null then
    create index if not exists profile_visits_workspace_idx on public.profile_visits (workspace_id) where workspace_id is not null;
  end if;
end $$;
