/**
 * Eigen badges (familiewapens, bedrijfslogo's). Elke admin-export gaat ervan uit
 * dat `assertAdminRole` al geslaagd is in `custom-badges.functions.ts`.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export type CustomBadge = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  holders: number;
  kind: BadgeKind;
  motto: string | null;
  story: string | null;
  issuerName: string | null;
  issuerUrl: string | null;
  accentColor: string | null;
};

export const BADGE_KINDS = ["crest", "emblem", "award", "partner"] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export type BadgeDetails = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  kind: BadgeKind;
  motto: string | null;
  story: string | null;
  issuerName: string | null;
  issuerUrl: string | null;
  accentColor: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const kindOf = (v: unknown): BadgeKind => ((BADGE_KINDS as readonly string[]).includes(String(v)) ? (v as BadgeKind) : "crest");

export type BadgeHolder = { userId: string; username: string | null; displayName: string | null; grantedAt: string; reason: string | null };

const toBadge = (r: Row): CustomBadge => ({
  id: String(r["id"]),
  slug: String(r["slug"]),
  name: String(r["name"]),
  description: (r["description"] as string | null) ?? null,
  imageUrl: (r["image_url"] as string | null) ?? null,
  holders: Number(r["holders"] ?? 0),
  kind: kindOf(r["kind"]),
  motto: str(r["motto"]),
  story: str(r["story"]),
  issuerName: str(r["issuer_name"]),
  issuerUrl: str(r["issuer_url"]),
  accentColor: str(r["accent_color"]),
});


export async function listCustomBadges(): Promise<CustomBadge[]> {
  const rows = (await sql`
    select b.id, b.slug, b.name, b.description, b.image_url, b.kind, b.motto, b.story,
           b.issuer_name, b.issuer_url, b.accent_color,
           (select count(*) from public.user_custom_badges u where u.badge_id = b.id)::int as holders
      from public.custom_badges b
     order by b.created_at desc
  `) as Row[];
  return rows.map(toBadge);
}

export async function createCustomBadge(input: BadgeDetails & { adminId: string }) {
  const base = input.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "badge";
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  const rows = (await sql`
    insert into public.custom_badges (slug, name, description, image_url, kind, motto, story, issuer_name, issuer_url, accent_color, created_by)
    values (${slug}, ${input.name}, ${input.description}, ${input.imageUrl}, ${input.kind}, ${input.motto}, ${input.story},
            ${input.issuerName}, ${input.issuerUrl}, ${input.accentColor}, ${input.adminId})
    returning id, slug, name, description, image_url, kind, motto, story, issuer_name, issuer_url, accent_color, 0 as holders
  `) as Row[];
  return toBadge(rows[0]!);
}

export async function updateCustomBadge(id: string, input: BadgeDetails) {
  await sql`
    update public.custom_badges
       set name = ${input.name}, description = ${input.description}, image_url = ${input.imageUrl},
           kind = ${input.kind}, motto = ${input.motto}, story = ${input.story},
           issuer_name = ${input.issuerName}, issuer_url = ${input.issuerUrl},
           accent_color = ${input.accentColor}, updated_at = now()
     where id = ${id}
  `;
  return { ok: true as const };
}

export async function deleteCustomBadge(id: string) {
  await sql`delete from public.custom_badges where id = ${id}`;
  return { ok: true as const };
}

export async function listBadgeHolders(badgeId: string): Promise<BadgeHolder[]> {
  const rows = (await sql`
    select u.user_id, p.username, p.display_name, u.granted_at, u.reason
      from public.user_custom_badges u
      left join public.profiles p on p.id = u.user_id
     where u.badge_id = ${badgeId}
     order by u.granted_at desc
  `) as Row[];
  return rows.map((r) => ({
    userId: String(r["user_id"]),
    username: (r["username"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    grantedAt: String(r["granted_at"]),
    reason: str(r["reason"]),
  }));
}

/** Zoekt op handle (profiel of alias) of weergavenaam. */
export async function findUsersByHandle(query: string) {
  const q = query.replace(/^@+/, "").trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = (await sql`
    select id, username, display_name
      from public.profiles
     where lower(username) like ${like} or lower(coalesce(display_name, '')) like ${like}
     order by (lower(username) = ${q}) desc, username
     limit 10
  `) as Row[];
  return rows.map((r) => ({
    userId: String(r["id"]),
    username: (r["username"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
  }));
}

export async function grantCustomBadge(userId: string, badgeId: string, adminId: string, reason: string | null = null) {
  await sql`
    insert into public.user_custom_badges (user_id, badge_id, granted_by, reason)
    values (${userId}, ${badgeId}, ${adminId}, ${reason})
    on conflict (user_id, badge_id) do update set reason = coalesce(excluded.reason, public.user_custom_badges.reason)
  `;
  return { ok: true as const };
}

export async function revokeCustomBadge(userId: string, badgeId: string) {
  await sql`delete from public.user_custom_badges where user_id = ${userId} and badge_id = ${badgeId}`;
  return { ok: true as const };
}

export async function badgesForUser(userId: string): Promise<CustomBadge[]> {
  const rows = (await sql`
    select b.id, b.slug, b.name, b.description, b.image_url, b.kind, b.motto, b.story,
           b.issuer_name, b.issuer_url, b.accent_color, 0 as holders
      from public.user_custom_badges u
      join public.custom_badges b on b.id = u.badge_id
     where u.user_id = ${userId}
     order by u.granted_at
  `) as Row[];
  return rows.map(toBadge);
}

/** Publiek: badges van een handle, enkel naam/omschrijving/afbeelding. */
export async function publicBadgesForHandle(rawHandle: string) {
  const handle = rawHandle.replace(/^@+/, "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,63}$/.test(handle)) return [];
  try {
    const rows = (await sql`
      select b.slug, b.name, b.description, b.image_url, b.kind, b.motto, b.story,
             b.issuer_name, b.issuer_url, b.accent_color, u.reason, u.show_on_name, u.show_in_badges,
             to_json(u.granted_at) as granted_at_iso,
             (select count(*) from public.user_custom_badges x where x.badge_id = b.id)::int as holders
        from public.profiles p
        join public.user_custom_badges u on u.user_id = p.id
        join public.custom_badges b on b.id = u.badge_id
        where p.username = ${handle}
         and u.rejected_at is null and u.revoked_at is null
         and (u.show_on_name or u.show_in_badges)
         and coalesce(p.is_banned, false) = false
          and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
       order by u.sort_order, u.granted_at
       limit 48
    `) as Row[];
    return rows.map((r) => ({
      slug: String(r["slug"]),
      name: String(r["name"]),
      description: (r["description"] as string | null) ?? null,
      imageUrl: (r["image_url"] as string | null) ?? null,
      kind: kindOf(r["kind"]),
      motto: str(r["motto"]),
      story: str(r["story"]),
      issuerName: str(r["issuer_name"]),
      issuerUrl: str(r["issuer_url"]),
      accentColor: str(r["accent_color"]),
      reason: str(r["reason"]),
      showOnName: r["show_on_name"] === true,
      showInBadges: r["show_in_badges"] === true,
      grantedAt: str(r["granted_at_iso"]),
      holders: Number(r["holders"] ?? 0),
    }));
  } catch {
    return [];
  }
}
