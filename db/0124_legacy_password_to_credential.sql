-- Moves legacy public.users.password_hash values into Better Auth before the
-- column is dropped (0125). Hashes keep their pbkdf2$ format; the app's
-- credential verifier accepts both pbkdf2$ (legacy) and Better Auth scrypt.
insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
select u.id::uuid, coalesce(nullif(u.user_metadata->>'full_name', ''), u.email), u.email,
       u.email_confirmed_at is not null, now(), now()
  from public.users u
 where u.password_hash is not null
   and coalesce(u.is_disabled, false) = false
   and u.user_metadata->>'neon_auth_id' is null
   and u.auth_user_id is null
   and not exists (select 1 from neon_auth."user" b where lower(b.email) = lower(u.email) or b.id = u.id::uuid);

insert into neon_auth.account ("accountId", "providerId", "userId", password, "createdAt", "updatedAt")
select u.id::text, 'credential', u.id::uuid, u.password_hash, now(), now()
  from public.users u
  join neon_auth."user" b on b.id = u.id::uuid
 where u.password_hash is not null
   and not exists (select 1 from neon_auth.account a where a."userId" = b.id and a."providerId" = 'credential');

update public.users u
   set auth_user_id = u.id::uuid,
       user_metadata = coalesce(u.user_metadata, '{}'::jsonb) || jsonb_build_object('neon_auth_id', u.id::text)
 where u.password_hash is not null
   and u.auth_user_id is null
   and exists (select 1 from neon_auth.account a where a."userId" = u.id::uuid and a."providerId" = 'credential');
