export type BadgeRarity = "artifact" | "common" | "uncommon" | "rare" | "epic";

export interface BadgeDef {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  rarity?: BadgeRarity | null;
  max_supply?: number | null;
}

export interface UnlockedBadge extends BadgeDef {
  awarded_at: string | null;
  serial_number?: number | null;
}

/**
 * Client-safe wrappers around the Neon-backed badge server functions. The
 * badge tables are optional infrastructure — a failed call must never break a
 * profile, so both helpers swallow errors and return an empty list.
 */

export async function fetchBadgeCatalogue(): Promise<BadgeDef[]> {
  try {
    const { getBadgeCatalogue } = await import("./badges.functions");
    const rows = await getBadgeCatalogue();
    return (rows ?? []) as BadgeDef[];
  } catch {
    return [];
  }
}

/** Badges a specific user has unlocked, in catalogue order. The server always
 * scopes this to the signed-in caller; `userId` is kept for call-site parity. */
export async function fetchUserBadges(_userId: string): Promise<UnlockedBadge[]> {
  try {
    const { getMyBadges } = await import("./badges.functions");
    const rows = await getMyBadges();
    return (rows ?? []) as UnlockedBadge[];
  } catch {
    return [];
  }
}

/** Publieke badgemuur van een profiel (werkt ook voor uitgelogde bezoekers). */
export async function fetchPublicUserBadges(userId: string): Promise<UnlockedBadge[]> {
  if (!userId || userId === "draft") return [];
  try {
    const { getPublicUserBadges } = await import("./badges.functions");
    const rows = await getPublicUserBadges({ data: { userId } });
    return (rows ?? []) as UnlockedBadge[];
  } catch {
    return [];
  }
}

/** "#00012" reads like a certificate; plain numbers read like a database id. */
export function formatSerial(serial?: number | null): string | null {
  if (!serial || serial < 1) return null;
  return `#${String(serial).padStart(5, "0")}`;
}
