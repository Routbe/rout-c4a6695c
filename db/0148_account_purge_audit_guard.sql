-- Hard purge is the only exception to security_audit_logs deletion besides retention.
-- Narrow to the locked, due account request; never exempt UPDATE/TRUNCATE/checkpoints.
create or replace function public.security_audit_refuse() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and tg_table_name = 'security_audit_logs' then
    if current_setting('rout.audit_retention',true) = 'on' and old.created_at < now() - interval '365 days' then return old; end if;
    if current_setting('rout.purge_user_id',true) = old.user_id and exists (
      select 1 from public.account_deletions d where d.user_id::text=old.user_id
      and d.cancelled_at is null and d.completed_at is null and d.purge_after<=now()
    ) then return old; end if;
  end if;
  raise exception 'security audit tables are append-only (% refused)', tg_op;
end $$;