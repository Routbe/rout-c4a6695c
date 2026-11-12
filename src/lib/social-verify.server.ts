import { sql } from "@/lib/neon";
import {
  canRefresh,
  isSocialPlatform,
  normalizeSocialUsername,
  socialProfileUrl,
  type SocialLinkDTO,
  type SocialPlatform,
} from "@/lib/social-verify";

/**
 * Server-only laag voor sociale eigendomsverificatie en gecachte
 * volgeraantallen.
 *
 * Verificatie werkt via een bio-link: de gebruiker plaatst `rout.be/<handle>`
 * in de bio van het doelprofiel. Wij halen die publieke pagina (of open API)
 * één keer op, slaan het volgeraantal op en zetten `is_verified`. Publieke
 * profielweergave leest daarna uitsluitend uit de database.
 */

type Row = Record<string, unknown>;

const UA =
  "Mozilla/5.0 (compatible; ROUTVerifier/1.0; +https://rout.be/about) AppleWebKit/537.36 Chrome/120 Safari/537.36";

function toDTO(row: Row): SocialLinkDTO {
  return {
    id: row["id"] as string,
    platform: row["platform"] as SocialPlatform,
    username: row["username"] as string,
    isVerified: Boolean(row["is_verified"]),
    followerCount: (row["follower_count"] as number | null) ?? null,
    lastSyncedAt: toIso(row["last_synced_at"]),
    verifiedAt: toIso(row["verified_at"]),
    lastError: (row["last_error"] as string | null) ?? null,
  };
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/* ------------------------------------------------------------------ reads */

export async function listSocialLinks(profileId: string): Promise<SocialLinkDTO[]> {
  const rows = (await sql`
    select id, platform, username, is_verified, follower_count,
           last_synced_at, verified_at, last_error
      from public.social_links
     where profile_id = ${profileId}
     order by position asc, created_at asc
  `) as Row[];
  return rows.map(toDTO);
}

/** Gecachte, publieke lijst voor de profielpagina — 0 externe HTTP-calls. */
export async function readPublicSocialLinks(profileId: string) {
  const { readSocialBlockLinks } = await import("./social-block.server");
  return readSocialBlockLinks(profileId);
}

/* ----------------------------------------------------------------- writes */

export async function upsertSocialLink(
  profileId: string,
  platformRaw: string,
  usernameRaw: string,
): Promise<SocialLinkDTO> {
  if (!isSocialPlatform(platformRaw)) throw new Error("platform_invalid");
  const platform = platformRaw;
  const username = normalizeSocialUsername(platform, usernameRaw);
  if (!username || username.length > 120) throw new Error("username_invalid");

  const rows = (await sql`
    insert into public.social_links (profile_id, platform, username)
    values (${profileId}, ${platform}, ${username})
    on conflict (profile_id, platform) do update set
      username = excluded.username,
      -- Nieuwe gebruikersnaam betekent opnieuw verifiëren.
      is_verified = case
        when public.social_links.username = excluded.username then public.social_links.is_verified
        else false
      end,
      follower_count = case
        when public.social_links.username = excluded.username then public.social_links.follower_count
        else null
      end,
      updated_at = now()
    returning id, platform, username, is_verified, follower_count,
              last_synced_at, verified_at, last_error
  `) as Row[];
  return toDTO(rows[0]!);
}

export async function deleteSocialLink(profileId: string, id: string) {
  await sql`delete from public.social_links where id = ${id} and profile_id = ${profileId}`;
  return { ok: true as const };
}

/* ----------------------------------------------------- external snapshots */

export type Snapshot = {
  bio: string;
  followerCount: number | null;
};

function parseCompact(value: string): number | null {
  const match = value.trim().match(/^([\d.,]+)\s*([kmb])?$/i);
  if (!match) return null;
  const raw = match[1]!.replace(/,/g, match[2] ? "." : "");
  const base = Number.parseFloat(raw);
  if (!Number.isFinite(base)) return null;
  const unit = match[2]?.toLowerCase();
  const factor = unit === "b" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
  return Math.round(base * factor);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/json" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`fetch_failed_${response.status}`);
  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!response.ok) throw new Error(`fetch_failed_${response.status}`);
  return (await response.json()) as T;
}

function metaContent(html: string, key: string): string {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  return (html.match(pattern)?.[1] ?? html.match(alt)?.[1] ?? "").replace(/&amp;/g, "&");
}

function followersFromText(text: string): number | null {
  const patterns = [
    /([\d.,]+\s*[KMB]?)\s*(?:followers|volgers|abonnees|subscribers|abonnés)/i,
    /(?:followers|volgers|abonnees|subscribers)[^\d]{0,10}([\d.,]+\s*[KMB]?)/i,
  ];
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit?.[1]) {
      const parsed = parseCompact(hit[1]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/** Haalt bio-tekst + volgeraantal op voor één sociaal account. */
export async function fetchSnapshot(platform: SocialPlatform, username: string): Promise<Snapshot> {
  let handle = username.replace(/^@/, "");

  if (platform === "github") {
    const user = await fetchJson<{ bio?: string | null; blog?: string | null; followers?: number }>(
      `https://api.github.com/users/${encodeURIComponent(handle)}`,
    );
    return {
      bio: `${user.bio ?? ""} ${user.blog ?? ""}`,
      followerCount: typeof user.followers === "number" ? user.followers : null,
    };
  }

  if (platform === "mastodon") {
    const [localHandle, host] = handle.split("@");
    const instance = host || "mastodon.social";
    const { isPublicHost } = await import("./open-web-rules");
    if (!isPublicHost(instance)) throw new Error("invalid_host");
    const account = await fetchJson<{
      note?: string;
      fields?: { name: string; value: string }[];
      followers_count?: number;
    }>(
      `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(localHandle ?? handle)}`,
    );
    const fields = (account.fields ?? []).map((f) => `${f.name} ${f.value}`).join(" ");
    return {
      bio: `${account.note ?? ""} ${fields}`,
      followerCount: typeof account.followers_count === "number" ? account.followers_count : null,
    };
  }

  if (platform === "bluesky" || platform === "wsocial") {
    // wsocial.eu draait op het AT Protocol: kale namen krijgen `.wsocial.eu`.
    if (platform === "wsocial" && !handle.includes(".")) handle = `${handle}.wsocial.eu`;
    const profile = await fetchJson<{ description?: string; followersCount?: number }>(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
    );
    return {
      bio: profile.description ?? "",
      followerCount: typeof profile.followersCount === "number" ? profile.followersCount : null,
    };
  }

  // Overige platformen: publieke OpenGraph-metadata van de profielpagina.
  const html = await fetchText(socialProfileUrl(platform, username));
  const description = `${metaContent(html, "og:description")} ${metaContent(html, "description")}`;
  return {
    bio: `${description} ${html.slice(0, 20000)}`,
    followerCount: followersFromText(description) ?? followersFromText(html.slice(0, 40000)),
  };
}

/* ------------------------------------------------------------ verification */

/** Alle vormen waarin het ROUT-profiel in een bio kan staan. */
export function expectedBioNeedles(handle: string): string[] {
  const clean = handle.replace(/^@/, "").toLowerCase();
  return [`rout.be/${clean}`, `rout.be/u/${clean}`, `rout.be/@${clean}`];
}

export function bioContainsRoutLink(bio: string, handle: string): boolean {
  const haystack = bio.toLowerCase().replace(/\s+/g, "");
  return expectedBioNeedles(handle).some((needle) => haystack.includes(needle.replace(/\s+/g, "")));
}

async function readHandle(profileId: string): Promise<string | null> {
  const rows = (await sql`
    select username from public.profiles where id = ${profileId} limit 1
  `) as Row[];
  return (rows[0]?.["username"] as string | null) ?? null;
}

export type VerifyResult = {
  ok: boolean;
  reason: "verified" | "link_missing" | "fetch_failed" | "not_found" | "rate_limited";
  link: SocialLinkDTO | null;
};

/**
 * Controleert de bio van het sociale profiel op de ROUT-link en cachet het
 * volgeraantal. `enforceInterval` beschermt de handmatige knop (24 uur).
 */
export async function verifySocialLink(
  profileId: string,
  id: string,
  enforceInterval = false,
): Promise<VerifyResult> {
  const rows = (await sql`
    select id, platform, username, is_verified, follower_count,
           last_synced_at, verified_at, last_error
      from public.social_links
     where id = ${id} and profile_id = ${profileId}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found", link: null };
  const link = toDTO(row);

  if (enforceInterval && !canRefresh(link.lastSyncedAt)) {
    return { ok: false, reason: "rate_limited", link };
  }

  const handle = await readHandle(profileId);
  if (!handle) return { ok: false, reason: "not_found", link };

  let snapshot: Snapshot;
  try {
    snapshot = await fetchSnapshot(link.platform, link.username);
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed";
    const saved = (await sql`
      update public.social_links
         set last_error = ${message}, last_synced_at = now()
       where id = ${id} and profile_id = ${profileId}
      returning id, platform, username, is_verified, follower_count,
                last_synced_at, verified_at, last_error
    `) as Row[];
    return { ok: false, reason: "fetch_failed", link: saved[0] ? toDTO(saved[0]) : link };
  }

  const aliasRows = (await sql`
    select handle from public.alias_profiles where user_id = ${profileId} limit 1
  `) as Row[];
  const aliasHandle = (aliasRows[0]?.["handle"] as string | null) ?? null;
  const verified =
    bioContainsRoutLink(snapshot.bio, handle) ||
    (aliasHandle ? bioContainsRoutLink(snapshot.bio, aliasHandle) : false);
  const saved = (await sql`
    update public.social_links
       set is_verified = ${verified},
           follower_count = coalesce(${snapshot.followerCount}, follower_count),
           verified_at = case when ${verified} then coalesce(verified_at, now()) else null end,
           last_synced_at = now(),
           last_error = ${verified ? null : "link_missing"}
     where id = ${id} and profile_id = ${profileId}
    returning id, platform, username, is_verified, follower_count,
              last_synced_at, verified_at, last_error
  `) as Row[];

  return {
    ok: verified,
    reason: verified ? "verified" : "link_missing",
    link: saved[0] ? toDTO(saved[0]) : link,
  };
}

/* -------------------------------------------------------------------- cron */

/**
 * Dagelijkse achtergrondsync: vernieuwt volgeraantallen van geverifieerde
 * accounts en zet `is_verified = false` wanneer de ROUT-link uit de bio is.
 */
export async function syncVerifiedSocialLinks(limit = 200) {
  const rows = (await sql`
    select l.id, l.profile_id, l.platform, l.username, p.username as handle
      from public.social_links l
      join public.profiles p on p.id = l.profile_id
     where l.is_verified = true
       and (l.last_synced_at is null or l.last_synced_at < now() - interval '24 hours')
     order by l.last_synced_at asc nulls first
     limit ${limit}
  `) as Row[];

  let updated = 0;
  let unverified = 0;
  let failed = 0;

  for (const row of rows) {
    const platform = row["platform"] as SocialPlatform;
    const username = row["username"] as string;
    const handle = row["handle"] as string | null;
    try {
      const snapshot = await fetchSnapshot(platform, username);
      const stillLinked = handle ? bioContainsRoutLink(snapshot.bio, handle) : false;
      await sql`
        update public.social_links
           set follower_count = coalesce(${snapshot.followerCount}, follower_count),
               is_verified = ${stillLinked},
               verified_at = case when ${stillLinked} then verified_at else null end,
               last_synced_at = now(),
               last_error = ${stillLinked ? null : "link_missing"}
         where id = ${row["id"] as string}
      `;
      if (stillLinked) updated += 1;
      else unverified += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "fetch_failed";
      await sql`
        update public.social_links
           set last_synced_at = now(), last_error = ${message}
         where id = ${row["id"] as string}
      `;
    }
  }

  return { checked: rows.length, updated, unverified, failed };
}
