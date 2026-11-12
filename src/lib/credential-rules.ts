export const CREDENTIAL_KINDS = ["crest", "emblem", "award", "partner", "badge", "certificate", "diploma"] as const;
export type CredentialKind = typeof CREDENTIAL_KINDS[number];

export type RecipientVisibility = {
  showOnName?: boolean | null;
  showInBadges?: boolean | null;
  revokedAt?: string | null;
  rejectedAt?: string | null;
};

export function credentialVisible(item: RecipientVisibility, place: "name" | "badges", profilePublic: boolean, generalVisible: boolean) {
  if (!profilePublic || !generalVisible || item.revokedAt || item.rejectedAt) return false;
  return (place === "name" ? item.showOnName : item.showInBadges) === true;
}

export function mayIssueCredential(ownerId: string | null, actorId: string, workspaceId: string | null, role: string | null) {
  if (workspaceId) return role === "owner" || role === "admin" || role === "developer";
  return ownerId !== null && ownerId === actorId;
}