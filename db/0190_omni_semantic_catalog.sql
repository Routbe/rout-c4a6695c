-- Owner-only projection of existing private draft cards, NOT a public profile feed.
-- Apply after 0184, 0188 and 0189. No plaintext bearer tokens in user_settings.
create table public.omni_matrix_items (
 id uuid primary key references public.social_grid_items(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 profile_space text not null check (profile_space in ('alias','verified')),
 block_id text not null,
 source_item_id text not null,
 content_type public.omni_content_type not null default 'social',
 image_path text not null check (image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'),
 target_url text check (char_length(target_url)<=2000 and (target_url ~ '^https://' or target_url ~ '^/[^/]')),
 title text not null default '' check (char_length(title)<=150),
 meta_tag text check (char_length(meta_tag)<=40),
 is_hero boolean not null default false,
 kinetic_preview_path text check (kinetic_preview_path ~ '^[0-9a-f-]{36}/omni-[A-Za-z0-9._-]+\.webm$'),
 created_at timestamptz not null default now(),
 unique(user_id,profile_space,block_id,source_item_id)
);
grant select,insert,update,delete on public.omni_matrix_items to rout_app;
alter table public.omni_matrix_items enable row level security;
alter table public.omni_matrix_items force row level security;
create policy omni_catalog_owner on public.omni_matrix_items to rout_app
 using(user_id=public.rout_current_user_id()) with check(user_id=public.rout_current_user_id());
create index omni_catalog_owner on public.omni_matrix_items(user_id,profile_space,created_at desc);

-- Compatibility read names without a second writable/public data store.
create view public.grid_items with (security_invoker=true) as
 select id,user_id,image_path,target_url,title,created_at from public.omni_matrix_items;
grant select on public.grid_items to rout_app;
create view public.ingest_tokens with (security_invoker=true) as
 select user_id,token_hash,created_at from public.omni_ingest_tokens;
grant select on public.ingest_tokens to rout_app;

create function public.rout_grid_media_path(p_url text) returns text
language sql immutable set search_path=pg_catalog,public as $$
 select case when p_url ~ '^/api/public/gallery-media\?path=[0-9a-f-]{36}(%2[Ff]|/)[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
 then replace(replace(split_part(p_url,'path=',2),'%2F','/'),'%2f','/') else null end
$$;
revoke all on function public.rout_grid_media_path(text) from public;
grant execute on function public.rout_grid_media_path(text) to rout_app;

create function public.sync_omni_semantic_draft() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare b jsonb; config jsonb; item jsonb; card uuid; path text; kept uuid[]:='{}';
begin
 for b in select value from jsonb_array_elements(coalesce(new.payload->'blocks','[]'::jsonb)) loop
  if b->>'kind'<>'social_grid' then continue; end if;
  begin config:=(b->>'value')::jsonb; exception when invalid_text_representation then continue; end;
  if jsonb_typeof(config->'items') is distinct from 'array' then continue; end if;
  for item in select value from jsonb_array_elements(config->'items') limit 30 loop
   path:=public.rout_grid_media_path(item->>'mediaUrl');
   if path is null or split_part(path,'/',1)<>new.user_id::text then continue; end if;
   select id into card from public.social_grid_items where user_id=new.user_id and profile_space=new.space
    and block_id=b->>'id' and source_item_id=item->>'id' limit 1;
   if card is null then continue; end if;
   insert into public.omni_matrix_items(id,user_id,profile_space,block_id,source_item_id,content_type,image_path,
    target_url,title,meta_tag,is_hero,kinetic_preview_path,created_at)
   values(card,new.user_id,new.space,b->>'id',item->>'id',
    (case when item->>'contentType' in ('article','podcast','program','short','event','social') then item->>'contentType' else 'social' end)::public.omni_content_type,
    path,nullif(item->>'targetUrl',''),left(coalesce(item->>'caption',''),150),left(nullif(item->>'metaTag',''),40),
    coalesce(item->'isHero'='true'::jsonb,false),
    case when public.rout_grid_media_path(item->>'kineticPreviewUrl') ~ '^[0-9a-f-]{36}/omni-[A-Za-z0-9._-]+\.webm$'
      and split_part(public.rout_grid_media_path(item->>'kineticPreviewUrl'),'/',1)=new.user_id::text
      then public.rout_grid_media_path(item->>'kineticPreviewUrl') else null end,
    coalesce(nullif(item->>'createdAt','')::timestamptz,now()))
   on conflict(id) do update set content_type=excluded.content_type,image_path=excluded.image_path,
    target_url=excluded.target_url,title=excluded.title,meta_tag=excluded.meta_tag,
    is_hero=excluded.is_hero,kinetic_preview_path=excluded.kinetic_preview_path;
   kept:=array_append(kept,card);
  end loop;
 end loop;
 delete from public.omni_matrix_items where user_id=new.user_id and profile_space=new.space and not(id=any(kept));
 return new;
end $$;
revoke all on function public.sync_omni_semantic_draft() from public;
-- Alphabetical trigger order: social_grid_draft_index runs before zz_omni.
create trigger zz_omni_semantic_draft after insert or update of payload on public.profile_drafts
 for each row execute function public.sync_omni_semantic_draft();
comment on table public.omni_matrix_items is 'Private semantic draft projection. Published profile blocks remain authoritative. image_path never contains an external URL.';