-- 0194: ROUT never stores referrers (project privacy policy and the promise in
-- "Mijn data"). Removes the referrer_domain column added in 0193 before any use.
alter table public.profile_visits drop column if exists referrer_domain;
