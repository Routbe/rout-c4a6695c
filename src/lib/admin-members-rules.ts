export type MemberStatus = "active" | "frozen" | "shadowbanned" | "suspended" | "banned";

/** Strictest wins: banned > suspended > frozen > shadowbanned > active. */
export function memberStatus(p: {
  is_banned?: boolean | null;
  is_suspended?: boolean | null;
  status?: string | null;
  is_shadowbanned?: boolean | null;
}): MemberStatus {
  if (p.is_banned || p.status === "banned") return "banned";
  if (p.is_suspended || p.status === "suspended") return "suspended";
  if (p.status === "frozen") return "frozen";
  if (p.is_shadowbanned) return "shadowbanned";
  return "active";
}

export const SETTABLE_STATUSES = ["active", "frozen", "shadowbanned"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];
