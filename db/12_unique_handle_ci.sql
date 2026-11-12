-- Case-insensitive unieke handles.
--
-- Handles worden al lowercase opgeslagen, maar een index op `lower(username)`
-- maakt het ook op databaseniveau onmogelijk dat `Jona26` en `jona26` naast
-- elkaar bestaan. Eerst normaliseren, dan de index bouwen.

update public.profiles
   set username = lower(trim(username))
 where username is not null
   and username <> lower(trim(username));

create unique index if not exists unique_handle_case_insensitive
  on public.profiles (lower(username));
