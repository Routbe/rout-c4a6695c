-- 65 — Community reviews. Only status = 'approved' is ever shown publicly.
create table if not exists public.community_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  author_name text not null,
  handle      text,
  quote       text not null check (char_length(quote) between 10 and 400),
  locale      text not null default 'nl',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists community_reviews_status_idx on public.community_reviews (status, approved_at desc);

grant select, insert, update, delete on public.community_reviews to rout_app;
