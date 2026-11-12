export type RuntimeRole = { connectionRole: string; targetRole: string; bypass: boolean; superuser: boolean; ownsTables: boolean };
/** Never confuse disabling an unused role with actual runtime RLS enforcement. */
export function enforcementBlockers(role: RuntimeRole, unprotectedTables: string[], servicePathsReviewed: boolean) {
  return [
    ...(role.connectionRole !== role.targetRole ? ["runtime_role_mismatch"] : []),
    ...(role.bypass ? ["runtime_bypassrls"] : []),
    ...(role.superuser ? ["runtime_superuser"] : []),
    ...(role.ownsTables ? ["runtime_table_owner"] : []),
    ...unprotectedTables.map((t) => `rls_disabled:${t}`),
    ...(!servicePathsReviewed ? ["service_paths_unreviewed"] : []),
  ];
}