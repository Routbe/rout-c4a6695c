/**
 * Server-only badge granting. Grants are idempotent: a replayed Stripe webhook
 * must never hand out a second serial number for the same badge.
 * Serial numbers / rarities live in the database defaults — never set here.
 */
import { sql } from "@/lib/neon";

export type BadgeSlug = "early_believer" | "verified" | "founder" | "supporter" | "bluesky";

/** Where a grant came from — shown in the dashboard activity log. */
export type BadgeSource =
  "card" | "sepa" | "subscription" | "refund" | "referral" | "admin" | "system";

type Row = Record<string, unknown>;

/** Appends one row per slug to the badge activity log. Never throws. */
async function logBadgeEvents(
  userId: string,
  slugs: string[],
  action: "granted" | "revoked",
  source: BadgeSource,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (slugs.length === 0) return;
  try {
    for (const slug of slugs) {
      await sql`
        insert into public.badge_events (user_id, badge_slug, action, source, details)
        values (${userId}, ${slug}, ${action}, ${source}, ${JSON.stringify(details)})
      `;
    }
  } catch (error) {
    console.error("badge event log failed", error);
  }
}

/** Grants badges by slug, skipping ones the user already unlocked. */
export async function awardBadges(
  userId: string,
  slugs: BadgeSlug[],
  source: BadgeSource = "system",
  details: Record<string, unknown> = {},
): Promise<BadgeSlug[]> {
  if (!userId || slugs.length === 0) return [];

  try {
    const catalogue = (await sql`
      select id, slug from public.badges where slug = any(${slugs}::text[])
    `) as Row[];
    if (catalogue.length === 0) return [];

    const existing = (await sql`
      select badge_id from public.user_badges where user_id = ${userId}
    `) as Row[];
    const owned = new Set(existing.map((row) => row["badge_id"] as string));

    const pending = catalogue.filter((badge) => !owned.has(badge["id"] as string));
    if (pending.length === 0) return [];

    const granted: BadgeSlug[] = [];
    for (const badge of pending) {
      try {
        await sql`
          insert into public.user_badges (user_id, badge_id)
          values (${userId}, ${badge["id"] as string})
          on conflict (user_id, badge_id) do nothing
        `;
        granted.push(badge["slug"] as BadgeSlug);
      } catch (error) {
        console.error("badge grant failed", error);
      }
    }

    await logBadgeEvents(userId, granted, "granted", source, details);
    return granted;
  } catch (error) {
    console.error("badge grant failed", error);
    return [];
  }
}

/** Removes badges again (refund / chargeback), leaving unrelated grants intact. */
export async function revokeBadges(
  userId: string,
  slugs: BadgeSlug[],
  source: BadgeSource = "system",
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!userId || slugs.length === 0) return;
  try {
    const catalogue = (await sql`
      select id, slug from public.badges where slug = any(${slugs}::text[])
    `) as Row[];
    const ids = catalogue.map((badge) => badge["id"] as string);
    if (ids.length === 0) return;

    const owned = (await sql`
      select badge_id from public.user_badges where user_id = ${userId} and badge_id = any(${ids}::uuid[])
    `) as Row[];
    const ownedIds = new Set(owned.map((row) => row["badge_id"] as string));

    await sql`
      delete from public.user_badges where user_id = ${userId} and badge_id = any(${ids}::uuid[])
    `;

    await logBadgeEvents(
      userId,
      catalogue.filter((b) => ownedIds.has(b["id"] as string)).map((b) => b["slug"] as string),
      "revoked",
      source,
      details,
    );
  } catch (error) {
    console.error("badge revoke failed", error);
  }
}
