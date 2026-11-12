/**
 * Pure rules for the Studio's on-device draft copy (see studio-draft-store.ts).
 * A local copy protects edits while ROUT is unreachable; it is never treated as "saved at ROUT".
 */
export type StudioSpace = "verified" | "alias" | "workspace";

/** One local draft per member and canvas; workspaces are keyed by their own id. */
export function studioDraftKey(userId: string, space: StudioSpace, workspaceId?: string | null): string | null {
  if (!userId) return null;
  if (space === "workspace") return workspaceId ? `${userId}:workspace:${workspaceId}` : null;
  return `${userId}:${space}`;
}

/** Local drafts older than this are dropped instead of offered for restore. */
export const STUDIO_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type LocalDraftOffer = "restore" | "discard" | "none";

/**
 * What to do with a local copy found when the Studio opens:
 * offer a restore only when it differs from what ROUT has and is recent.
 */
export function localDraftOffer(local: { savedAt: number; fingerprint: string } | null, serverFingerprint: string, now: number): LocalDraftOffer {
  if (!local) return "none";
  if (now - local.savedAt > STUDIO_DRAFT_MAX_AGE_MS) return "discard";
  if (local.fingerprint === serverFingerprint) return "discard";
  return "restore";
}

export type SaveIndicator = "saving" | "saved" | "device-only" | "not-saved" | "idle";

/**
 * Status shown in the Studio: orange "device-only" only when ROUT could not be
 * reached and the latest edit is safely stored on this device.
 */
export function saveIndicator(s: { saving: boolean; dirty: boolean; failed: boolean; unreachable?: boolean; localSavedRev: number; editRev: number; savedAt: number | null }): SaveIndicator {
  if (s.saving) return "saving";
  // Only a connection problem resolves itself; a rejected edit stays red so the member acts on it.
  if (s.failed) return s.unreachable && s.localSavedRev >= s.editRev && s.editRev > 0 ? "device-only" : "not-saved";
  if (s.dirty) return "saving";
  return s.savedAt ? "saved" : "idle";
}

/** Stable fingerprint of a draft so local and server copies can be compared. */
export function draftFingerprint(value: unknown): string {
  const seen = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(seen);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, seen((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(seen(value));
}

/** Save failures that a later retry can fix without the member changing anything. */
export function isUnreachableSaveError(code: string | undefined): boolean {
  return code === "network" || code === "db_unavailable" || code === "db_timeout";
}
