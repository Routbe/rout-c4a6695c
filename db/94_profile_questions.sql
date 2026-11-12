-- 94 — Anonymous Q&A: guests ask, owners answer; answered questions show publicly.
create table if not exists public.profile_questions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 300),
  answer      text check (answer is null or char_length(answer) between 1 and 1000),
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists profile_questions_owner_idx on public.profile_questions (owner_id, created_at desc);
create index if not exists profile_questions_pub_idx on public.profile_questions (owner_id, answered_at desc) where published;
grant select, insert, update, delete on public.profile_questions to rout_app;
