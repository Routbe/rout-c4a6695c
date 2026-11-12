import { applyVisibilityRules, liveStateFromPresence, type BlockVisibilityRule } from "./profile";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";

export type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  source: string;
  occurred_at: string;
};

/** Combine badge grants and permitted public activity, newest first. */
export function mergeTimeline(badges: TimelineItem[], activity: TimelineItem[], limit = 20) {
  return [...badges, ...activity]
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    .slice(0, limit);
}

/** Fields a visitor may never see on a private profile. */
const PRIVATE_FIELDS = ["bio", "tagline", "blocks", "avatar_url", "favicon_url", "verified_legal_name", "business_name", "total_reach_count"] as const;

/** Strip profile content when the owner switched the public profile off. */
export function redactPrivateProfile<T extends Record<string, unknown>>(
  row: T,
  prefs: Pick<ProfileDisplayPrefs, "publicProfile"> & Partial<Pick<ProfileDisplayPrefs, "presence">>,
): T {
  if (prefs.publicProfile) {
    // Context-aware rules run here so hidden blocks never reach the visitor.
    if (!Array.isArray(row["blocks"])) return row;
    const blocks = applyVisibilityRules(
      row["blocks"] as { visibilityRule?: BlockVisibilityRule }[],
      liveStateFromPresence(prefs.presence),
    );
    return { ...row, blocks } as T;
  }
  const copy: Record<string, unknown> = { ...row, is_private: true };
  for (const f of PRIVATE_FIELDS) copy[f] = f === "blocks" ? [] : null;
  return copy as T;
}
