-- Account-merge guard parity.
-- src/lib/account-merge-rules.ts marks tables as "skip" (a secondary account that
-- owns rows there must block the merge), but execute_account_merge (0152) only
-- knows the tables that existed when it was written. Tables added since then were
-- silently cascade-deleted with the secondary account. This adds a
-- `merge_blocked:<table>` guard for each of them, before the first write, for
-- every listed table that exists. Idempotent: a table already guarded is skipped.
-- Guards: merge_blocked:parent_authorizations merge_blocked:ephemeral_statuses
-- merge_blocked:presence_broadcast_jobs merge_blocked:omni_ingest_tokens
-- merge_blocked:omni_jobs merge_blocked:omni_matrix_items merge_blocked:social_grid_items
-- merge_blocked:e2ee_key_wraps merge_blocked:card_designs merge_blocked:card_freezes
-- merge_blocked:factory_card_inventory merge_blocked:physical_keys merge_blocked:wallet_passes
-- merge_blocked:oidc_subjects merge_blocked:app_issued_credentials
-- merge_blocked:user_connected_apps_visibility merge_blocked:recovery_vaults
-- merge_blocked:recovery_attempts merge_blocked:rout_card_generations
-- A feature-branch table created later (e2ee_key_wraps, 0204) needs this file re-run.

do $own$ begin execute format('grant rout_merge_executor to %I with inherit true, set true', current_user); end $own$;
grant create on schema public to rout_merge_executor;

do $m$
declare
  v_def text;
  v_new text;
  v_guard text := '';
  v_type text;
  t record;
begin
  select pg_get_functiondef('public.execute_account_merge(text,text,text,text)'::regprocedure) into v_def;
  for t in
    select * from (values
      ('parent_authorizations'), ('ephemeral_statuses'), ('presence_broadcast_jobs'),
      ('omni_ingest_tokens'), ('omni_jobs'), ('omni_matrix_items'), ('social_grid_items'),
      ('e2ee_key_wraps'), ('card_designs'), ('card_freezes'), ('factory_card_inventory'),
      ('physical_keys'), ('wallet_passes'), ('oidc_subjects'), ('app_issued_credentials'),
      ('user_connected_apps_visibility'), ('recovery_vaults'), ('recovery_attempts'),
      ('rout_card_generations')
    ) v(tbl)
  loop
    continue when to_regclass('public.' || t.tbl) is null;
    -- The merge runs as the non-bypass executor: it may only test whether the
    -- secondary owns a row (column-level read of user_id under an executor-only policy).
    execute format('grant select (user_id) on public.%I to rout_merge_executor', t.tbl);
    execute format('drop policy if exists atomic_merge_guard on public.%I', t.tbl);
    execute format('create policy atomic_merge_guard on public.%I for select to rout_merge_executor using (true)', t.tbl);
    continue when position('merge_blocked:' || t.tbl || '''' in v_def) > 0;
    select data_type into v_type from information_schema.columns
     where table_schema = 'public' and table_name = t.tbl and column_name = 'user_id';
    if v_type is null then
      raise exception 'merge guard: %.user_id missing', t.tbl;
    end if;
    v_guard := v_guard || format(
      E' perform public.rout_merge_assert((not exists (select 1 from public.%I where %I = %s)), %L);\n',
      t.tbl, 'user_id', case when v_type = 'uuid' then 'v_secondary' else 'v_secondary::text' end,
      'merge_blocked:' || t.tbl);
  end loop;
  if v_guard = '' then return; end if;
  -- Anchor: the last guard written by 0152, which sits before the first write.
  v_new := regexp_replace(v_def, E'([^\\n]*''merge_blocked:wallets''[^\\n]*\\n)', E'\\1' || replace(v_guard, '\', '\\'));
  if v_new = v_def then
    raise exception 'execute_account_merge: guard anchor merge_blocked:wallets not found';
  end if;
  execute v_new;
end $m$;

revoke create on schema public from rout_merge_executor;
do $own$ begin execute format('revoke rout_merge_executor from %I', current_user); end $own$;
