-- Social Grid is edited with the existing revisioned profile draft.
-- This owner-only index makes cards queryable without publishing private drafts.
create table public.social_grid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  profile_space text not null check (profile_space in ('alias', 'verified')),
  block_id text not null,
  source_item_id text not null,
  platform text not null check (platform in ('instagram','tiktok','article','custom')),
  media_url text not null,
  caption text not null default '',
  target_url text,
  is_pinned boolean not null default false,
  is_video boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, profile_space, block_id, source_item_id)
);
grant select, insert, update, delete on public.social_grid_items to rout_app;
alter table public.social_grid_items enable row level security;
alter table public.social_grid_items force row level security;
create policy social_grid_owner on public.social_grid_items
  for all to rout_app
  using (user_id = public.rout_current_user_id())
  with check (user_id = public.rout_current_user_id());
create index social_grid_owner_order on public.social_grid_items(user_id, profile_space, is_pinned desc, position);

create function public.sync_social_grid_draft() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  b jsonb;
  config jsonb;
  item jsonb;
  ordinal bigint;
  kept uuid[] := '{}';
  card_id uuid;
begin
  for b in select value from jsonb_array_elements(coalesce(new.payload->'blocks','[]'::jsonb)) loop
    if b->>'kind' <> 'social_grid' then continue; end if;
    begin
      config := (b->>'value')::jsonb;
    exception when invalid_text_representation then
      continue;
    end;
    if jsonb_typeof(config->'items') <> 'array' then continue; end if;
    for item, ordinal in select value, ordinality from jsonb_array_elements(config->'items') with ordinality loop
      if ordinal > 30 or coalesce(item->>'id','') = '' or coalesce(item->>'mediaUrl','') = '' then continue; end if;
      insert into public.social_grid_items
        (user_id, profile_space, block_id, source_item_id, platform, media_url, caption, target_url, is_pinned, is_video, position, created_at)
      values (new.user_id, new.space, b->>'id', item->>'id',
        case when item->>'platform' in ('instagram','tiktok','article','custom') then item->>'platform' else 'custom' end,
        item->>'mediaUrl', coalesce(item->>'caption',''), nullif(item->>'targetUrl',''),
        coalesce(item->'pinned' = 'true'::jsonb,false), coalesce(item->'isVideo' = 'true'::jsonb,false),
        ordinal - 1, coalesce(nullif(item->>'createdAt','')::timestamptz, now()))
      on conflict (user_id, profile_space, block_id, source_item_id) do update set
        platform=excluded.platform, media_url=excluded.media_url, caption=excluded.caption,
        target_url=excluded.target_url, is_pinned=excluded.is_pinned, is_video=excluded.is_video,
        position=excluded.position
      returning id into card_id;
      kept := array_append(kept, card_id);
    end loop;
  end loop;
  delete from public.social_grid_items
    where user_id=new.user_id and profile_space=new.space and not (id = any(kept));
  return new;
end $$;
create trigger social_grid_draft_index after insert or update of payload on public.profile_drafts
  for each row execute function public.sync_social_grid_draft();
comment on table public.social_grid_items is 'Owner-only draft card index. Public profile cards remain the published blocks snapshot; no anonymous draft reads.';