-- 0172: optional icon choice for a workspace. NULL means "derive from category".
-- Uploaded logos keep using workspaces.avatar_url (an image URL); this column
-- only stores a key from the app's fixed icon set (src/lib/workspace-icons.ts).
alter table public.workspaces add column if not exists icon text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_icon_key') then
    alter table public.workspaces add constraint workspaces_icon_key check (icon is null or icon ~ '^[a-z][a-z0-9-]{1,23}$');
  end if;
end $$;
