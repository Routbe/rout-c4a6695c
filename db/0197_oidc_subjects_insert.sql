-- 0197: the runtime role (rout_app) writes subjects only for the user in its transaction context.
-- Subjects are derived in server code (subject-vault.server.ts); no update or delete path exists.
drop policy if exists oidc_subjects_insert_own on public.oidc_subjects;
create policy oidc_subjects_insert_own on public.oidc_subjects for insert
  with check (user_id = public.rout_current_user_id());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    revoke update, delete, truncate on public.oidc_subjects from rout_app;
    grant select, insert on public.oidc_subjects to rout_app;
  end if;
end $$;
