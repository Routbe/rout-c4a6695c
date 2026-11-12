-- 0128: where a visitor lands on the root "/" of a member's verified custom domain.
do $$ begin
  create type public.root_redirect_kind as enum ('profile_hub', 'custom_url', 'rout_main', 'none');
exception when duplicate_object then null; end $$;

alter table public.custom_domains
  add column if not exists root_redirect_type public.root_redirect_kind not null default 'profile_hub',
  add column if not exists root_redirect_url text;

alter table public.custom_domains drop constraint if exists custom_domains_root_redirect_url_chk;
alter table public.custom_domains add constraint custom_domains_root_redirect_url_chk check (
  (root_redirect_type <> 'custom_url' and root_redirect_url is null)
  or (root_redirect_type = 'custom_url' and root_redirect_url ~ '^https://[^\s/?#]+[^\s]*$' and char_length(root_redirect_url) <= 2048)
);
