-- 0121 — Link public.users to the Better Auth identity (neon_auth."user").
-- Older accounts kept their own public.users id and store the Better Auth id in
-- user_metadata.neon_auth_id, so a direct FK on users.id would reject them. A dedicated
-- auth_user_id column carries the link with ON DELETE CASCADE: deleting the identity removes the
-- application user. Backfilled only where the referenced identity exists.

alter table public.users add column if not exists auth_user_id uuid;

update public.users u set auth_user_id = a.id
  from neon_auth."user" a
 where u.auth_user_id is null
   and a.id = coalesce(nullif(u.user_metadata->>'neon_auth_id', ''), u.id::text)::uuid
   and (u.user_metadata->>'neon_auth_id' is null or u.user_metadata->>'neon_auth_id' ~* '^[0-9a-f-]{36}$');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_auth_user_id_fkey') then
    alter table public.users add constraint users_auth_user_id_fkey
      foreign key (auth_user_id) references neon_auth."user"(id) on delete cascade;
  end if;
end $$;

create unique index if not exists users_auth_user_id_key on public.users (auth_user_id) where auth_user_id is not null;

comment on column public.users.password_hash is
  'DEPRECATED: Better Auth stores passwords in neon_auth.account. Kept read-only for legacy sign-in until removed by a later migration.';
