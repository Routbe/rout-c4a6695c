-- 0138: per-app email choice may also be the ROUT private relay (db/0137).
alter table public.app_email_assignments drop constraint if exists app_email_assignments_source_check;
alter table public.app_email_assignments add constraint app_email_assignments_source_check
  check (source in ('primary', 'alias', 'relay'));
alter table public.app_email_assignments drop constraint if exists app_email_assignments_check;
alter table public.app_email_assignments add constraint app_email_assignments_check
  check ((source = 'alias') = (alias_id is not null));
