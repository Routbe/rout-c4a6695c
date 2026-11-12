import { sql } from "@/lib/neon";
import { parseDisplayPrefs } from "@/lib/profile-display";

import type { TimelineItem } from "@/lib/public-timeline";
export type { TimelineItem };

type Row = Record<string, unknown>;

import { mergeTimeline } from "@/lib/public-timeline";

/**
 * Publieke tijdlijn: enkel als het profiel openbaar is én de tijdlijn aan staat.
 * Geeft nooit e-mail, interne account-ID's of inloggegevens terug.
 */
export async function readPublicTimeline(userId: string): Promise<TimelineItem[]> {
  const prof = (await sql`
    select to_jsonb(profiles) -> 'display_prefs' as display_prefs,
           coalesce(is_banned, false) as banned, status
      from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const p = prof[0];
  if (!p || p["banned"] || p["status"] === "frozen") return [];
  const prefs = parseDisplayPrefs(p["display_prefs"]);
  if (!prefs.publicProfile || !prefs.timelineVisible) return [];

  let badges: TimelineItem[] = [];
  if (prefs.badgeShowcaseVisible) {
    try {
      const rows = (await sql`
        select e.id::text as id, coalesce(b.name, e.badge_slug) as title, e.created_at
          from public.badge_events e
          left join public.badges b on b.slug = e.badge_slug
         where e.user_id = ${userId} and e.action = 'grant'
         order by e.created_at desc limit 20
      `) as Row[];
      badges = rows.map((r) => ({
        id: `b-${r["id"]}`,
        kind: "badge",
        title: String(r["title"]),
        detail: null,
        source: "rout",
        occurred_at: new Date(r["created_at"] as string).toISOString(),
      }));
    } catch {
      badges = [];
    }
  }

  let activity: TimelineItem[] = [];
  try {
    const rows = (await sql`
      select id::text as id, kind, title, detail, source, occurred_at
        from public.public_activity
       where user_id = ${userId} and visibility = 'public'
       order by occurred_at desc limit 20
    `) as Row[];
    activity = rows.map((r) => ({
      id: `a-${r["id"]}`,
      kind: String(r["kind"]),
      title: String(r["title"]),
      detail: (r["detail"] as string | null) ?? null,
      source: String(r["source"]),
      occurred_at: new Date(r["occurred_at"] as string).toISOString(),
    }));
  } catch {
    // Migratie 43 nog niet uitgevoerd: toon enkel badges.
    activity = [];
  }
  return mergeTimeline(badges, activity);
}
