/** Metadata-only, complete inventory; no user data. Policy expressions need human review. */
export const RLS_AUDIT_QUERY = `select n.nspname as schema_name, c.relname as table_name,
 c.relrowsecurity as rls, c.relforcerowsecurity as forced,
 array(select a.attname::text from pg_attribute a where a.attrelid=c.oid and not a.attisdropped
   and a.attname in ('user_id','owner_id','workspace_id','host_user_id')) as scope_columns,
 coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid))) from pg_policy p where p.polrelid=c.oid),'[]'::jsonb) as policies
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and exists (
   select 1 from pg_attribute a where a.attrelid=c.oid and not a.attisdropped
    and a.attname in ('user_id','owner_id','workspace_id','host_user_id')) order by c.relname`;
export type AuditTable = { table_name: string; rls: boolean; policies: unknown[] };
export function auditFailures(tables: AuditTable[], bypassRoles: string[]) {
  return {
    disabled: tables.filter((table) => !table.rls).map((table) => table.table_name),
    missingPolicies: tables.filter((table) => table.policies.length === 0).map((table) => table.table_name),
    bypassRoles,
  };
}