-- 0162 — Public reads the strict RLS of 0149 cut off.
-- Visitors (no rout.current_user_id) could not read any private-alias page
-- (/u/<alias>) or any verified custom domain, so public alias pages rendered
-- empty and the web badge could never match a member's domain. Like
-- profiles.rout_public_read, these allow SELECT only, and only of rows that are
-- public by nature: enabled aliases and DNS-verified domains.

drop policy if exists rout_public_read on public.alias_profiles;
create policy rout_public_read on public.alias_profiles for select using (enabled = true);

drop policy if exists rout_public_verified on public.custom_domains;
create policy rout_public_verified on public.custom_domains for select using (status = 'verified');
