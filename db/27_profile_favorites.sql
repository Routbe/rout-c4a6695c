-- 27 — Favorieten (film, serie, boek …) in de weergavevoorkeuren.
--
-- De favorietenlijst leeft in `profiles.display_prefs.favorites` als JSON-array,
-- zodat de studio opties kan uitbreiden zonder kolomwijziging. Bestaande
-- profielen krijgen expliciet een lege lijst zodat de publieke weergave en de
-- studio nooit op `undefined` vallen.

update public.profiles
   set display_prefs = coalesce(display_prefs, '{}'::jsonb) || '{"favorites":[]}'::jsonb
 where display_prefs is null
    or not (display_prefs ? 'favorites');
