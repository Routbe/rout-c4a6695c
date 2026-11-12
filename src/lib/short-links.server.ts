/**
 * Neon-backed short-link data layer.
 *
 * Owns everything that used to run through Postgres RPCs
 * (`resolve_short_link`, `log_qr_scan`, `manage_short_link`) plus slug
 * allocation and tracked-QR creation. No row level security exists on Neon,
 * so every write here is explicitly scoped by `user_id` or by the dashboard
 * token (which is itself the credential for the public stats dashboard).
 */
import { sql } from "@/lib/neon";
import {
  BASE36_SLUG_LENGTH,
  SLUG_ALLOCATION_ATTEMPTS,
  baseSlugLengthForUsage,
  randomBase36Slug,
  slugLengthForAttempt,
} from "@/lib/base36";

type Row = Record<string, unknown>;

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomToken(length = 24): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  const rows = (await sql`
    select id from public.tracked_qrs where slug = ${slug.toLowerCase()} limit 1
  `) as Row[];
  return rows.length > 0;
}

/** Hoeveel root-codes van deze lengte zijn al uitgedeeld (voor de 80%-regel). */
async function countRootSlugs(length: number): Promise<number> {
  try {
    const rows = (await sql`
      select count(*)::int as n from public.tracked_qrs
       where slug not like '%/%' and length(slug) = ${length}
    `) as Row[];
    return (rows[0]?.["n"] as number) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Deelt een vrije Base36-code uit.
 *
 * Vier tekens is de standaard (past in een Version 1-QR). Botst dat, dan
 * proberen we tot drie keer opnieuw en schalen daarna automatisch naar 5 en 6
 * tekens. Zit de naamruimte van de basislengte al boven 80% vol, dan beginnen
 * we meteen een teken langer.
 */
export async function allocateSlugServer(): Promise<string | null> {
  const used = await countRootSlugs(BASE36_SLUG_LENGTH);
  const base = baseSlugLengthForUsage(used, BASE36_SLUG_LENGTH);
  for (let attempt = 0; attempt < SLUG_ALLOCATION_ATTEMPTS; attempt++) {
    const slug = randomBase36Slug(slugLengthForAttempt(attempt, base)).toLowerCase();
    if (!(await isSlugTaken(slug))) return slug;
  }
  return null;
}

/** Same limits the old Postgres trigger `enforce_short_link_limits` enforced. */
async function assertQuota(userId: string) {
  const profileRows = (await sql`
    select coalesce(verified,false) or coalesce(is_paid,false) or coalesce(is_early_believer,false) as is_verified
      from public.profiles where id = ${userId}
  `) as Row[];
  const isVerified = Boolean(profileRows[0]?.["is_verified"]);
  const perHour = isVerified ? 60 : 10;
  const maxTotal = isVerified ? 1000 : 25;

  const rows = (await sql`
    select
      count(*) filter (where created_at > now() - interval '1 hour')::int as recent,
      count(*)::int as total
    from public.tracked_qrs where user_id = ${userId}
  `) as Row[];
  const recent = (rows[0]?.["recent"] as number) ?? 0;
  const total = (rows[0]?.["total"] as number) ?? 0;
  if (recent >= perHour)
    throw new Error("RATE_LIMIT_SHORT_LINKS: too many new short links in the last hour");
  if (total >= maxTotal) throw new Error("RATE_LIMIT_SHORT_LINKS: short link quota reached");
}

export async function createTrackedQr(
  userId: string,
  input: {
    slug: string;
    targetType: string;
    targetUrl: string;
    label: string | null;
    customDomain: string | null;
    kind: string;
  },
) {
  await assertQuota(userId);
  const rows = (await sql`
    insert into public.tracked_qrs (slug, dashboard_token, target_type, target_url, label, user_id, custom_domain, kind)
    values (${input.slug}, ${randomToken(24)}, ${input.targetType}, ${input.targetUrl}, ${input.label},
            ${userId}, ${input.customDomain}, ${input.kind})
    returning id, slug, dashboard_token, target_type, target_url, label, custom_domain, kind, created_at
  `) as Row[];
  return rows[0]!;
}

export async function promoteToShortLink(userId: string, id: string, kind: string) {
  const rows = (await sql`
    update public.tracked_qrs
       set kind = ${kind}, short_link_enabled = true, updated_at = now()
     where id = ${id} and user_id = ${userId}
    returning id, kind
  `) as Row[];
  if (!rows[0]) throw new Error("not_found");
  return rows[0];
}

/** Verified domains this user may publish short links on. */
export async function listDomainsForTracking(userId: string) {
  return (await sql`
    select domain, is_default, status, short_links_enabled
      from public.custom_domains
     where user_id = ${userId}
     order by is_default desc
  `) as Row[];
}

export async function getTrackingTier(userId: string) {
  const rows = (await sql`
    select verified, is_paid, is_early_believer from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const linkCountRows = (await sql`
    select count(*)::int as n from public.tracked_qrs where user_id = ${userId}
  `) as Row[];
  return {
    verified: (rows[0]?.["verified"] as boolean | null) ?? null,
    isPaid: (rows[0]?.["is_paid"] as boolean | null) ?? null,
    isEarlyBeliever: (rows[0]?.["is_early_believer"] as boolean | null) ?? null,
    linkCount: (linkCountRows[0]?.["n"] as number) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public resolution + click logging (replaces resolve_short_link/log_qr_scan)
// ---------------------------------------------------------------------------

export type ResolveRow = { id: string; status: string; target_url: string | null };

export async function resolveSlug(slug: string): Promise<ResolveRow | null> {
  const rows = (await sql`
    select q.id,
      case
        when not q.is_active then 'disabled'
        when q.expires_at is not null and q.expires_at < now() then 'expired'
        else 'ok'
      end as status,
      q.target_url
    from public.tracked_qrs q
    where q.slug = ${slug.toLowerCase()}
    limit 1
  `) as Row[];
  return (rows[0] as unknown as ResolveRow) ?? null;
}

export async function logScan(input: {
  trackedQrId: string;
  device: string | null;
  country: string | null;
  browser: string | null;
  os: string | null;
}) {
  await sql`
    insert into public.qr_scans (tracked_qr_id, device, country, browser, os)
    values (${input.trackedQrId}, ${input.device}, ${input.country}, ${input.browser}, ${input.os})
  `;
}

// ---------------------------------------------------------------------------
// Owner dashboard (replaces short_link_stats/manage_short_link)
// ---------------------------------------------------------------------------

export async function getStatsByToken(token: string) {
  const rows = (await sql`
    select * from public.tracked_qrs where dashboard_token = ${token} limit 1
  `) as Row[];
  const qr = rows[0];
  if (!qr) return null;
  const scans = (await sql`
    select scanned_at, country, device, browser, os
      from public.qr_scans
     where tracked_qr_id = ${qr["id"] as string}
     order by scanned_at desc
  `) as Row[];
  return { qr, scans };
}

export async function manageByToken(
  token: string,
  action: string,
  opts: {
    targetUrl?: string | null;
    isActive?: boolean | null;
    expiresAt?: string | null;
    slug?: string | null;
  },
) {
  const rows = (await sql`
    select id from public.tracked_qrs where dashboard_token = ${token} limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("Dashboard not found");
  const id = row["id"] as string;

  if (action === "set_target") {
    if (!opts.targetUrl || opts.targetUrl.length < 3) throw new Error("Invalid target url");
    if ((await import("./short-link-target")).shortLinkTargetBlocked(opts.targetUrl)) throw new Error("blocked_target");
    await sql`update public.tracked_qrs set target_url = ${opts.targetUrl}, updated_at = now() where id = ${id}`;
  } else if (action === "set_active") {
    await sql`update public.tracked_qrs set is_active = ${opts.isActive ?? true}, updated_at = now() where id = ${id}`;
  } else if (action === "set_expiry") {
    await sql`update public.tracked_qrs set expires_at = ${opts.expiresAt ?? null}, updated_at = now() where id = ${id}`;
  } else if (action === "regenerate_slug") {
    if (!opts.slug) throw new Error("Missing slug");
    if (await isSlugTaken(opts.slug)) throw new Error("Slug already taken");
    await sql`update public.tracked_qrs set slug = ${opts.slug.toLowerCase()}, updated_at = now() where id = ${id}`;
  } else if (action === "delete") {
    await sql`delete from public.tracked_qrs where id = ${id}`;
  } else {
    throw new Error(`Unknown action ${action}`);
  }

  return { ok: true };
}

/**
 * Owner-scoped destination update for the dashboard "Bewerk bestemming"
 * action. Only `target_url` (and `updated_at`) change — slug, dashboard
 * token and every other field stay exactly as they were.
 */
export async function updateTrackedQrTarget(
  userId: string,
  id: string,
  targetUrl: string,
): Promise<{ id: string; slug: string; target_url: string; updated_at: string }> {
  const { shortLinkTargetBlocked } = await import("./short-link-target");
  if (shortLinkTargetBlocked(targetUrl)) throw new Error("blocked_target");
  const rows = (await sql`
    update public.tracked_qrs
       set target_url = ${targetUrl}, updated_at = now()
     where id = ${id} and user_id = ${userId}
    returning id, slug, target_url, updated_at
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("not_found");
  return {
    id: row["id"] as string,
    slug: row["slug"] as string,
    target_url: row["target_url"] as string,
    updated_at: new Date(row["updated_at"] as Date | string).toISOString(),
  };
}
