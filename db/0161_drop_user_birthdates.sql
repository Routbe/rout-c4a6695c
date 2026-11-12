-- 0161 — Privacy by design: exact birth dates are never collected (16+ is a
-- consent checkbox; 18+ will be a boolean verified claim). Remove the legacy
-- table, after taking it out of the account-merge routine that referenced it.

-- 1. Rewrite execute_account_merge without its two user_birthdates statements.
--    The owner (rout_merge_executor) is kept; the migrating role gets the
--    owner's rights only for this migration, exactly as 0152 does.
do $own$ begin execute format('grant rout_merge_executor to %I with inherit true, set true', current_user); end $own$;
grant create on schema public to rout_merge_executor;

do $m$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.execute_account_merge(text,text,text,text)'::regprocedure) into v_def;
  v_new := regexp_replace(v_def, E'[^\\n]*"user_birthdates"[^\\n]*\\n', '', 'g');
  if position('user_birthdates' in v_new) > 0 then
    raise exception 'execute_account_merge still references user_birthdates';
  end if;
  if v_new <> v_def then execute v_new; end if;
end $m$;

revoke create on schema public from rout_merge_executor;
do $own$ begin execute format('revoke rout_merge_executor from %I', current_user); end $own$;

-- 2. Drop the table (no CASCADE: any unexpected dependent object aborts this).
drop table public.user_birthdates;
