import { sql } from "@/lib/neon";

/**
 * Bezoekregistratie voor publieke profielen (root én alias).
 *
 * Privacyvriendelijk: geen cookies, geen IP-opslag. Unieke bezoekers worden
 * geteld via een dag-gebonden hash van ip + user-agent + salt, zodat niemand
 * over dagen heen gevolgd kan worden.
 */

type Row = Record<string, unknown>;

export type VisitSpace = "root" | "alias";

export type RecordVisitInput = {
  handle: string;
  space: VisitSpace;
  path?: string | null;
  locale?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
};

/** The hashing salt is a required secret: a guessable default would let anyone reverse visitor hashes. */
export function visitHashSalt(env: Record<string, string | undefined> = process.env): string | null {
  const salt = env["CONTACT_HASH_SALT"]?.trim() ?? "";
  return salt.length >= 32 ? salt : null;
}

async function dailyVisitorHash(salt: string, ip: string, userAgent: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${salt}:${day}:${ip}:${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deviceFrom(userAgent: string): string {
  if (/iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return "mobile";
  if (/ipad|tablet|android/i.test(userAgent)) return "tablet";
  if (!userAgent) return "unknown";
  return "desktop";
}

/** Kortstondige de-duplicatie: één bezoek per bezoeker/handle per 30 minuten. */
const DEDUPE_MS = 30 * 60 * 1000;
const recent = new Map<string, number>();

export async function recordVisit(input: RecordVisitInput): Promise<{ recorded: boolean }> {
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase();
  if (!handle) return { recorded: false };

  const userAgent = (input.userAgent ?? "").slice(0, 400);
  // Bots tellen niet mee als bezoek.
  if (/bot|crawler|spider|preview|curl|wget|monitor|lighthouse/i.test(userAgent)) {
    return { recorded: false };
  }

  const salt = visitHashSalt();
  if (!salt) {
    console.warn("[visits] CONTACT_HASH_SALT missing or shorter than 32 characters; visit not recorded.");
    return { recorded: false };
  }
  const visitorHash = await dailyVisitorHash(salt, input.ip ?? "", userAgent);
  const key = `${visitorHash}:${handle}:${input.space}`;
  const now = Date.now();
  const seen = recent.get(key);
  if (seen && now - seen < DEDUPE_MS) return { recorded: false };
  recent.set(key, now);
  if (recent.size > 5000) {
    for (const [k, at] of recent) if (now - at > DEDUPE_MS) recent.delete(k);
  }
  // Shared dedupe across all server instances: the in-memory map is only a fast path.
  const dup = (await sql`
    select public.rout_visit_seen_recently(${visitorHash}, ${handle}, ${input.space === "root" ? "root" : "alias"}) as seen
  `) as Row[];
  if (dup[0]?.["seen"] === true) return { recorded: false };

  const ownerRows = (await sql`
    select id from public.profiles where lower(username) = ${handle} limit 1
  `) as Row[];
  let ownerId = (ownerRows[0]?.["id"] as string | undefined) ?? null;
  if (!ownerId) {
    try {
      const aliasRows = (await sql`
        select user_id from public.alias_profiles where lower(handle) = ${handle} limit 1
      `) as Row[];
      ownerId = (aliasRows[0]?.["user_id"] as string | undefined) ?? null;
    } catch {
      ownerId = null;
    }
  }
  if (!ownerId) {
    const rootRows = (await sql`
      select id from public.profiles
       where lower(coalesce(subdomain_alias, '')) = ${handle} limit 1
    `) as Row[];
    ownerId = (rootRows[0]?.["id"] as string | undefined) ?? null;
  }

  await sql`
    insert into public.profile_visits
      (profile_user_id, handle, space, path, locale, country, device, visitor_hash)
    values (
      ${ownerId}, ${handle}, ${input.space === "root" ? "root" : "alias"},
      ${(input.path ?? "").slice(0, 200) || null},
      ${(input.locale ?? "").slice(0, 10).toLowerCase() || null},
      ${(input.country ?? "").slice(0, 2).toUpperCase() || null},
      ${deviceFrom(userAgent)},
      ${visitorHash}
    )
  `;
  return { recorded: true };
}

export type VisitStats = {
  days: number;
  total: number;
  unique: number;
  bySpace: { root: number; alias: number };
  perDay: Array<{ date: string; visits: number }>;
  perLanguage: Array<{ locale: string; visits: number }>;
  perCountry: Array<{ country: string; visits: number }>;
  perDevice: Array<{ device: string; visits: number }>;
  recent: Array<{
    at: string;
    handle: string;
    space: VisitSpace;
    locale: string | null;
    country: string | null;
    device: string | null;
    path: string | null;
  }>;
};

const EMPTY: VisitStats = {
  days: 30,
  total: 0,
  unique: 0,
  bySpace: { root: 0, alias: 0 },
  perDay: [],
  perLanguage: [],
  perCountry: [],
  perDevice: [],
  recent: [],
};

/** Volledig bezoekersoverzicht voor één account. `space` filtert op namespace. */
export async function readVisitStats(
  userId: string,
  options: { days?: number; space?: VisitSpace | "all" } = {},
): Promise<VisitStats> {
  const days = Math.min(Math.max(options.days ?? 30, 1), 365);
  const space = options.space ?? "all";

  try {
  } catch {
    return { ...EMPTY, days };
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const spaceFilter = space === "all" ? null : space;

  const [totals, perDayRows, perLangRows, perCountryRows, recentRows, perDeviceRows] = await Promise.all([
    sql`
      select count(*)::int as total,
             count(distinct visitor_hash)::int as unique_visitors,
             count(*) filter (where space = 'root')::int as root_visits,
             count(*) filter (where space = 'alias')::int as alias_visits
        from public.profile_visits
       where profile_user_id = ${userId}
         and created_at >= ${since}
         and (${spaceFilter}::text is null or space = ${spaceFilter})
    ` as Promise<Row[]>,
    sql`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
             count(*)::int as visits
        from public.profile_visits
       where profile_user_id = ${userId}
         and created_at >= ${since}
         and (${spaceFilter}::text is null or space = ${spaceFilter})
       group by 1 order by 1 asc
    ` as Promise<Row[]>,
    sql`
      select coalesce(locale, 'unknown') as locale, count(*)::int as visits
        from public.profile_visits
       where profile_user_id = ${userId}
         and created_at >= ${since}
         and (${spaceFilter}::text is null or space = ${spaceFilter})
       group by 1 order by 2 desc limit 12
    ` as Promise<Row[]>,
    sql`
      select coalesce(country, '??') as country, count(*)::int as visits
        from public.profile_visits
       where profile_user_id = ${userId}
         and created_at >= ${since}
         and (${spaceFilter}::text is null or space = ${spaceFilter})
       group by 1 order by 2 desc limit 12
    ` as Promise<Row[]>,
    sql`
      select created_at, handle, space, locale, country, device, path
        from public.profile_visits
       where profile_user_id = ${userId}
         and created_at >= ${since}
         and (${spaceFilter}::text is null or space = ${spaceFilter})
       order by created_at desc limit 50
    ` as Promise<Row[]>,
    sql`
      select coalesce(device, 'unknown') as device, count(*)::int as visits
        from public.profile_visits
       where profile_user_id = ${userId}
         and created_at >= ${since}
         and (${spaceFilter}::text is null or space = ${spaceFilter})
       group by 1 order by 2 desc limit 5
    ` as Promise<Row[]>,
  ]);

  const t = totals[0] ?? {};
  return {
    days,
    total: Number(t["total"] ?? 0),
    unique: Number(t["unique_visitors"] ?? 0),
    bySpace: {
      root: Number(t["root_visits"] ?? 0),
      alias: Number(t["alias_visits"] ?? 0),
    },
    perDay: perDayRows.map((r) => ({
      date: String(r["date"]),
      visits: Number(r["visits"] ?? 0),
    })),
    perLanguage: perLangRows.map((r) => ({
      locale: String(r["locale"]),
      visits: Number(r["visits"] ?? 0),
    })),
    perCountry: perCountryRows.map((r) => ({
      country: String(r["country"]),
      visits: Number(r["visits"] ?? 0),
    })),
    perDevice: perDeviceRows.map((r) => ({ device: String(r["device"] ?? "unknown"), visits: Number(r["visits"] ?? 0) })),
    recent: recentRows.map((r) => ({
      at: new Date(String(r["created_at"])).toISOString(),
      handle: String(r["handle"]),
      space: (r["space"] === "root" ? "root" : "alias") as VisitSpace,
      locale: (r["locale"] as string | null) ?? null,
      country: (r["country"] as string | null) ?? null,
      device: (r["device"] as string | null) ?? null,
      path: (r["path"] as string | null) ?? null,
    })),
  };
}

/* ---------- Klikmetingen ---------- */

const recentClicks = new Map<string, number>();
const CLICK_DEDUPE_MS = 10_000;

export async function recordLinkClick(input: {
  handle: string;
  blockId: string;
  label?: string | null;
  space: VisitSpace;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ recorded: boolean }> {
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase().slice(0, 64);
  const blockId = input.blockId.trim().slice(0, 64);
  if (!handle || !blockId) return { recorded: false };
  const userAgent = (input.userAgent ?? "").slice(0, 400);
  if (/bot|crawler|spider|preview|curl|wget|monitor|lighthouse/i.test(userAgent)) {
    return { recorded: false };
  }
  const salt = visitHashSalt();
  if (!salt) {
    console.warn("[visits] CONTACT_HASH_SALT missing or shorter than 32 characters; click not recorded.");
    return { recorded: false };
  }
  const visitorHash = await dailyVisitorHash(salt, input.ip ?? "", userAgent);
  const key = `${visitorHash}:${handle}:${blockId}`;
  const now = Date.now();
  const seen = recentClicks.get(key);
  if (seen && now - seen < CLICK_DEDUPE_MS) return { recorded: false };
  recentClicks.set(key, now);
  if (recentClicks.size > 5000) {
    for (const [k, at] of recentClicks) if (now - at > CLICK_DEDUPE_MS) recentClicks.delete(k);
  }
  const owner = (await sql`
    select id from public.profiles where lower(username) = ${handle} limit 1
  `) as Row[];
  let ownerId = (owner[0]?.["id"] as string | undefined) ?? null;
  if (!ownerId) {
    try {
      const alias = (await sql`
        select user_id from public.alias_profiles where lower(handle) = ${handle} limit 1
      `) as Row[];
      ownerId = (alias[0]?.["user_id"] as string | undefined) ?? null;
    } catch {
      ownerId = null;
    }
  }
  if (!ownerId) return { recorded: false };
  await sql`
    insert into public.profile_link_clicks
      (profile_user_id, handle, block_id, label, space, visitor_hash)
    values (${ownerId}, ${handle}, ${blockId}, ${(input.label ?? "").slice(0, 120) || null},
            ${input.space === "root" ? "root" : "alias"}, ${visitorHash})
  `;
  return { recorded: true };
}

export type LinkClickStats = {
  total: number;
  perLink: Array<{ blockId: string; label: string | null; clicks: number; unique: number }>;
};

export async function readLinkClickStats(
  userId: string,
  options: { days?: number; space?: VisitSpace | "all" } = {},
): Promise<LinkClickStats> {
  const days = Math.min(Math.max(options.days ?? 30, 1), 365);
  const spaceFilter = !options.space || options.space === "all" ? null : options.space;
  try {
  } catch {
    return { total: 0, perLink: [] };
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = (await sql`
    select block_id, max(label) as label, count(*)::int as clicks,
           count(distinct visitor_hash)::int as unique_clicks
      from public.profile_link_clicks
     where profile_user_id = ${userId} and created_at >= ${since}
       and (${spaceFilter}::text is null or space = ${spaceFilter})
     group by block_id order by 3 desc limit 25
  `) as Row[];
  const perLink = rows.map((r) => ({
    blockId: String(r["block_id"]),
    label: (r["label"] as string | null) ?? null,
    clicks: Number(r["clicks"] ?? 0),
    unique: Number(r["unique_clicks"] ?? 0),
  }));
  return { total: perLink.reduce((s, l) => s + l.clicks, 0), perLink };
}
