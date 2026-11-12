-- Passwords live only in Better Auth (neon_auth.account, providerId 'credential').
-- No application code reads or writes public.users.password_hash anymore.
alter table public.users drop column if exists password_hash;
