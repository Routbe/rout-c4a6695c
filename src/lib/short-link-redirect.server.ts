import { isTrustedLinkOwner } from "@/lib/short-link-trust";
import { redirectDestination } from "@/lib/security/redirect-target";
import { safeExternalRedirect } from "@/lib/security/safe-redirect.server";
/**
 * Edge-side short-link resolution.
 *
 * Runs inside the request handler of `/s/$slug` and the root namespace
 * (`rout.be/A89K`), so a scan turns into a `302` before any HTML or JavaScript
 * is shipped — target well under 15 ms, versus a full document load plus a
 * client round-trip in the old resolver.
 *
 * Privacy: no IP address, referer or raw user agent ever reaches the database.
 * The click counter stores only a coarse device/browser/OS label, exactly like
 * the client resolver did. For abuse protection we hash the caller's IP with a
 * per-process random salt, keep the digest in memory only, and never persist or
 * log it.
 */
import { sql } from "@/lib/neon";
import { parseAgent } from "@/lib/user-agent";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit.server";
import { linkCache } from "@/lib/edge-link-cache";

export type ResolveStatus =
  "ok" | "not_found" | "disabled" | "expired" | "suspended" | "paused" | "error";

type ResolveShortLinkRow = { id: string; status: string; target_url: string | null };

export type ResolveResult =
  | { status: "ok"; targetUrl: string; id: string }
  | { status: Exclude<ResolveStatus, "ok">; targetUrl?: undefined; id?: undefined };

/** How many resolutions one anonymous caller may make per minute. */
export const RESOLVE_LIMIT_PER_MINUTE = 120;
/** Ceiling per short code per minute, shared across callers. */
export const RESOLVE_LIMIT_PER_SLUG_PER_MINUTE = 600;

/** Random per-process salt: rotating and in-memory, so digests are unlinkable. */
const IP_SALT = crypto.randomUUID();

/** Coarse device bucket from the user-agent header — never stored verbatim. */
export function deviceFromAgent(ua: string | null): string {
  const s = (ua ?? "").toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk/.test(s)) return "tablet";
  if (/mobi|iphone|android|phone|ipod|blackberry|opera mini/.test(s)) return "mobile";
  return "desktop";
}

/** Short, salted digest of the caller IP; lives only inside the rate-limit map. */
async function callerKey(request: Request): Promise<string> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const bytes = new TextEncoder().encode(`${IP_SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Resolves a slug and records the click. Returns `null` when the backend is not
 * configured, so the caller can fall back to rendering the app shell.
 */
export async function resolveShortLink(
  slug: string,
  request: Request,
): Promise<ResolveResult | null> {
  const code = slug.trim().toLowerCase();
  if (!code) return { status: "not_found" };

  const { hasDatabase } = await import("@/lib/neon");
  if (!hasDatabase()) return null;

  // Per-caller and per-code sliding windows. Spam protection only, not a
  // security boundary (see rate-limit.server.ts): a flood gets a 429 instead
  // of turning the resolver into a database amplifier.
  try {
    enforceRateLimit(`resolve:slug:${code}`, RESOLVE_LIMIT_PER_SLUG_PER_MINUTE, 60_000);
    enforceRateLimit(`resolve:ip:${await callerKey(request)}`, RESOLVE_LIMIT_PER_MINUTE, 60_000);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    throw error;
  }

  // Edge cache hit: skip every database lookup except the fire-and-forget counter.
  const cached = await Promise.resolve(linkCache.get(code)).catch(() => null);
  if (cached) {
    logScan(cached.id, request);
    return { status: "ok", targetUrl: cached.targetUrl, id: cached.id };
  }

  let row: ResolveShortLinkRow | undefined;
  try {
    const rows = (await sql.query(`select * from public.resolve_short_link($1)`, [
      code,
    ])) as ResolveShortLinkRow[];
    row = rows[0];
  } catch {
    return { status: "error" };
  }
  if (!row) return { status: "not_found" };
  if (row.status !== "ok" || !row.target_url) {
    return { status: (row.status as Exclude<ResolveStatus, "ok">) ?? "error" };
  }

  // A self-paused (frozen) owner pauses every redirect they own; the link keeps
  // working the moment they sign back in.
  let trustedOwner = false;
  try {
    const ownerRows = (await sql.query(
      `select p.status, coalesce(p.verified, false) as verified, p.created_at,
              coalesce(vi.tier_1_real_human, false) as tier1, coalesce(vi.tier_2_legal_identity, false) as tier2
         from public.tracked_qrs q
         join public.profiles p on p.id = q.user_id
         left join public.verified_identities vi on vi.user_id = q.user_id
        where q.id = $1 limit 1`,
      [row.id],
    )) as { status: string | null; verified: boolean; created_at: string | null; tier1: boolean; tier2: boolean }[];
    const owner = ownerRows[0];
    if (owner?.status === "frozen") return { status: "paused" };
    let emailVerified = false;
    try {
      const em = (await sql.query(
        `select coalesce(a."emailVerified", false) as ev from public.tracked_qrs q
           join public.users u on u.id = q.user_id
           join neon_auth."user" a on a.id = u.auth_user_id
          where q.id = $1 limit 1`,
        [row.id],
      )) as { ev: boolean }[];
      emailVerified = em[0]?.ev === true;
    } catch {
      // Unknown email status counts as unconfirmed (warning page shown).
    }
    trustedOwner = owner
      ? isTrustedLinkOwner({
          tier1RealHuman: owner.tier1 === true,
          tier2LegalIdentity: owner.tier2 === true,
          verified: owner.verified === true,
          emailVerified,
          accountCreatedAt: owner.created_at ? new Date(owner.created_at) : null,
        })
      : false;
  } catch {
    // A failing owner lookup must never break a healthy redirect.
  }

  logScan(row.id, request);

  // Trusted owners (tier 1/2, verified, or confirmed email older than 7 days) redirect directly; other links show the /go "you are leaving ROUT" page.
  const destination = await safeExternalRedirect(row.target_url, trustedOwner);
  if (!destination) return { status: "error" };
  await Promise.resolve(linkCache.set(code, { id: row.id, targetUrl: destination })).catch(() => undefined);
  return { status: "ok", targetUrl: destination, id: row.id };
}

/** Fire-and-forget: counting must never delay the redirect. */
function logScan(id: string, request: Request): void {
  const ua = request.headers.get("user-agent");
  const agent = parseAgent(ua);
  void sql
    .query(
      `select public.log_qr_scan(_tracked_qr_id => $1, _device => $2, _country => $3, _browser => $4, _os => $5)`,
      [id, deviceFromAgent(ua), request.headers.get("cf-ipcountry"), agent.browser, agent.os],
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

export function shortLinkDestination(target: string, trustedOwner: boolean): string {
  return redirectDestination(target, trustedOwner) ?? "/";
}

/** Sober, multilingual "this link is paused" page (HTTP 200, never cached). */
export function pausedResponse(request: Request): Response {
  const cookie = request.headers.get("cookie") ?? "";
  const lang = /rout_lang=(nl|en|fr|de)/.exec(cookie)?.[1] ?? "en";
  const copy: Record<string, { title: string; body: string }> = {
    nl: {
      title: "Deze link is tijdelijk gepauzeerd",
      body: "De eigenaar heeft dit account tijdelijk gepauzeerd. Probeer het later opnieuw.",
    },
    en: {
      title: "This link is temporarily paused",
      body: "The owner has paused this account for now. Please try again later.",
    },
    fr: {
      title: "Ce lien est temporairement en pause",
      body: "Le propriétaire a mis ce compte en pause. Réessayez plus tard.",
    },
    de: {
      title: "Dieser Link ist vorübergehend pausiert",
      body: "Der Inhaber hat dieses Konto pausiert. Bitte versuche es später erneut.",
    },
  };
  const { title, body } = copy[lang] ?? copy["en"]!;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#fff;color:#111;font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:1.25rem;font-weight:600;margin:0 0 .5rem}p{font-size:.875rem;color:#666;margin:0}
@media(prefers-color-scheme:dark){body{background:#0b0b0b;color:#f5f5f5}p{color:#a1a1a1}}</style>
</head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** 302 response with caching disabled so an owner can repoint a live code. */
export function redirectResponse(targetUrl: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return new Response("Te veel aanvragen — probeer het straks opnieuw.", {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" },
  });
}
