/**
 * Pure rules for who may manage a registered app in the Developer Console.
 * Personal apps (no workspace) belong to their creator only. Workspace apps can
 * be edited by every member with developer rights in that workspace, while the
 * caller works inside that workspace. Shared by provider.server.ts SQL and tests.
 */

/** Workspace roles that may edit apps, rotate secrets, manage test users and delete apps. */
export const APP_EDITOR_ROLES = ["owner", "admin", "developer"] as const;
/** Irreversible changes (pairwise subject switch) stay with workspace owners and admins. */
export const APP_ADMIN_ROLES = ["owner", "admin"] as const;

export type ClientActor = { userId: string; workspaceId: string | null };
export type ClientOwnership = { ownerUserId: string | null; workspaceId: string | null };

export function canManageClient(
  app: ClientOwnership,
  actor: ClientActor,
  memberRole: string | null,
  roles: readonly string[] = APP_EDITOR_ROLES,
): boolean {
  if (app.workspaceId === null) return app.ownerUserId !== null && app.ownerUserId === actor.userId;
  if (actor.workspaceId !== app.workspaceId) return false;
  return memberRole !== null && roles.includes(memberRole);
}
