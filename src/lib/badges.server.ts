/**
 * Neon-backed badge catalogue / grant reads.
 *
 * `rarity`, `max_supply` and `serial_number` are optional columns that may not
 * exist on every deployment yet — each query tries the richer projection
 * first and falls back to the base columns so a missing migration never
 * breaks the badges panel.
 */
import { sql } from "@/lib/neon";

export type BadgeRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  rarity?: string | null;
  max_supply?: number | null;
};

type Row = Record<string, unknown>;

export async function fetchBadgeCatalogueDb(): Promise<BadgeRow[]> {
  try {
    const rows = (await sql`
      select id, slug, name, description, icon, color, sort_order, rarity, max_supply
        from public.badges
       order by sort_order asc
    `) as Row[];
    return rows as unknown as BadgeRow[];
  } catch {
    try {
      const rows = (await sql`
        select id, slug, name, description, icon, color, sort_order
          from public.badges
         order by sort_order asc
      `) as Row[];
      return rows as unknown as BadgeRow[];
    } catch {
      return [];
    }
  }
}

export type UnlockedBadgeRow = BadgeRow & {
  awarded_at: string | null;
  serial_number?: number | null;
};

export async function fetchUserBadgesDb(userId: string): Promise<UnlockedBadgeRow[]> {
  try {
    const rows = (await sql`
      select b.id, b.slug, b.name, b.description, b.icon, b.color, b.sort_order,
             b.rarity, b.max_supply, ub.awarded_at, ub.serial_number
        from public.user_badges ub
        join public.badges b on b.id = ub.badge_id
       where ub.user_id = ${userId}
    `) as Row[];
    return (rows as unknown as UnlockedBadgeRow[]).sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    const rows = (await sql`
      select b.id, b.slug, b.name, b.description, b.icon, b.color, b.sort_order,
             ub.awarded_at
        from public.user_badges ub
        join public.badges b on b.id = ub.badge_id
       where ub.user_id = ${userId}
    `) as Row[];
    return (rows as unknown as UnlockedBadgeRow[]).sort((a, b) => a.sort_order - b.sort_order);
  }
}

export type BadgeActivityRow = {
  id: string;
  badge_slug: string;
  action: string;
  source: string | null;
  serial_number: number | null;
  created_at: string;
};

/** Most recent badge grants/revocations for the member's activity log. */
export async function fetchBadgeActivityDb(
  userId: string,
  limit = 12,
): Promise<BadgeActivityRow[]> {
  try {
    const rows = (await sql`
      select id, badge_slug, action, source, serial_number, created_at
        from public.badge_events
       where user_id = ${userId}
       order by created_at desc
       limit ${limit}
    `) as Row[];
    return rows as unknown as BadgeActivityRow[];
  } catch {
    const rows = (await sql`
      select id, badge_slug, action, source, created_at
        from public.badge_events
       where user_id = ${userId}
       order by created_at desc
       limit ${limit}
    `) as Row[];
    return (rows as unknown as Omit<BadgeActivityRow, "serial_number">[]).map((r) => ({
      ...r,
      serial_number: null,
    }));
  }
}
