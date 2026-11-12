import { docs } from "@/lib/docs-catalog";
import { STATIC_SITEMAP_ENTRIES, buildSitemapXml, docSitemapEntry, type SitemapEntry } from "@/lib/sitemap";
import { styledProfilePath, urlStyleForAtPreference, urlStyleHasAt, isUrlStyle } from "@/lib/profile-url";
import { workspacePublicPath } from "@/lib/workspace-rules";

export const SEO_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
} as const;

export const SUB_SITEMAPS = ["static", "profiles", "workspaces", "calendars"] as const;
export type SubSitemap = (typeof SUB_SITEMAPS)[number];

const day = (v: unknown): string | undefined => {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

export const SITEMAP_PAGE_SIZE = 1000;
export const SITEMAP_URL_LIMIT = 50000;

/** Deterministic keyset reads; never silently truncate a sitemap or publish a partial query result. */
export async function readSitemapPages(fetchPage: (after: string, limit: number) => Promise<Record<string, unknown>[]>, key: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let after = "";
  for (;;) {
    const page = await fetchPage(after, SITEMAP_PAGE_SIZE);
    rows.push(...page);
    if (rows.length > SITEMAP_URL_LIMIT) throw new Error("Sitemap requires additional shards");
    if (page.length < SITEMAP_PAGE_SIZE) return rows;
    const next = page.at(-1)?.[key];
    if (typeof next !== "string" || next <= after) throw new Error("Sitemap pagination did not advance");
    after = next;
  }
}

/** Same member exclusions apply to profile and linked-agenda discovery. */
export const PUBLIC_MEMBER_PREDICATE = `p.verified is true and p.username is not null
  and coalesce(p.is_suspended, false) = false and coalesce(p.is_banned, false) = false
  and coalesce(p.is_shadowbanned, false) = false
  and coalesce(p.status, 'active') not in ('frozen', 'banned', 'suspended')
  and p.workspace_id is null
  and coalesce((p.display_prefs->>'publicProfile')::boolean, true) = true`;

export function staticEntries(): SitemapEntry[] {
  return [...STATIC_SITEMAP_ENTRIES, ...docs.map(docSitemapEntry)];
}

/** Verified, public, unsuspended member profiles at their single main URL. Aliases (privacy) are never listed. */
export async function profileEntries(): Promise<SitemapEntry[]> {
  const { sql } = await import("@/lib/neon");
  const rows = await readSitemapPages((after, limit) => sql.query(`
    select p.username, p.url_style, p.updated_at from public.profiles p
    where ${PUBLIC_MEMBER_PREDICATE} and p.username > $1
    order by p.username limit $2`, [after, limit]), "username");
  return rows.map((r) => {
    const style = isUrlStyle(r["url_style"]) ? r["url_style"] : "clean_at";
    return {
      path: styledProfilePath(String(r["username"]), urlStyleForAtPreference(urlStyleHasAt(style))),
      lastmod: day(r["updated_at"]),
      changefreq: "weekly",
      priority: 0.8,
    };
  });
}

/** Workspaces whose Studio page is published publicly. */
export async function workspaceEntries(): Promise<SitemapEntry[]> {
  const { sql } = await import("@/lib/neon");
  const { readPublishedStudio, workspaceStudioIsPublic } = await import("@/lib/workspace-studio");
  const rows = await readSitemapPages((after, limit) => sql.query(`
    select slug, domain, domain_verified_at, public_profile
    from public.workspaces where slug is not null and slug > $1
    order by slug limit $2`, [after, limit]), "slug");
  return rows.flatMap((r) => {
    const studio = readPublishedStudio(r["public_profile"]);
    if (!studio || !workspaceStudioIsPublic(studio)) return [];
    return [{
      path: workspacePublicPath(String(r["slug"]), { name: (r["domain"] as string | null) ?? null, verified: Boolean(r["domain_verified_at"]) }),
      changefreq: "weekly" as const,
      priority: 0.8,
    }];
  });
}

/** Linked, active agendas of verified public members. Sovereign /a/ pages are stealth and never listed. */
export async function calendarEntries(): Promise<SitemapEntry[]> {
  const { sql } = await import("@/lib/neon");
  const rows = await readSitemapPages((after, limit) => sql.query(`
    select p.username, max(c.updated_at) as updated_at
    from public.rout_calendars c join public.profiles p on p.id = c.user_id
    where c.mode = 'linked' and c.is_active and (c.expires_at is null or c.expires_at > now())
      and ${PUBLIC_MEMBER_PREDICATE} and p.username > $1
      and exists (select 1 from public.booking_event_types t where t.user_id = p.id and t.is_active)
    group by p.username order by p.username limit $2`, [after, limit]), "username");
  return rows.map((r) => ({ path: `/u/${String(r["username"]).toLowerCase()}/agenda`, lastmod: day(r["updated_at"]), changefreq: "weekly", priority: 0.6 }));
}

export async function subSitemapXml(origin: string, kind: SubSitemap): Promise<string> {
  const entries = kind === "static" ? staticEntries()
    : kind === "profiles" ? await profileEntries()
    : kind === "workspaces" ? await workspaceEntries()
    : await calendarEntries();
  return buildSitemapXml(origin, entries);
}

export function buildSitemapIndexXml(origin: string): string {
  const items = SUB_SITEMAPS.map((k) => `  <sitemap>\n    <loc>${origin}/sitemap-${k}.xml</loc>\n  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}

export async function sitemapResponse(origin: string, kind: SubSitemap): Promise<Response> {
  try {
    const xml = await subSitemapXml(origin, kind);
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", ...SEO_CACHE_HEADERS } });
  } catch (e) {
    console.error(`[sitemap] ${kind} unavailable`);
    // Never serve partial XML: crawlers retry a 503 later.
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "600", "Cache-Control": "no-store" } });
  }
}
