/**
 * Multi-domain awareness. One codebase serves both brands:
 *
 *   rout.be  — the full ecosystem (tool pages, profiles at /@handle)
 *   dlp.li   — the short-link / alias engine (profiles at /handle, no redirect)
 *
 * Everything domain-related resolves through this module so no component ever
 * hardcodes a host again. Client-safe: no server-only imports.
 */

export const PRIMARY_DOMAIN = "rout.be";
export const SHORT_DOMAIN = "dlp.li";

export const APP_DOMAINS = [PRIMARY_DOMAIN, SHORT_DOMAIN] as const;
export type AppDomain = (typeof APP_DOMAINS)[number];

export function isAppDomain(value: string): value is AppDomain {
  return (APP_DOMAINS as readonly string[]).includes(value);
}

/** Strips port, `www.` and casing from a raw Host header. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

/**
 * Which brand is being served right now. Preview and localhost hosts fall back
 * to the primary domain, so nothing breaks outside production.
 */
export function domainFromHost(host: string | null | undefined): AppDomain {
  const clean = normalizeHost(host);
  if (clean === SHORT_DOMAIN || clean.endsWith(`.${SHORT_DOMAIN}`)) return SHORT_DOMAIN;
  return PRIMARY_DOMAIN;
}

export function isShortDomain(host: string | null | undefined): boolean {
  return domainFromHost(host) === SHORT_DOMAIN;
}

export function cleanHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Path a profile lives on for a given brand: `/@handle` vs the bare `/handle`. */
export function profilePath(handle: string, domain: AppDomain = PRIMARY_DOMAIN): string {
  const h = cleanHandle(handle);
  return domain === SHORT_DOMAIN ? `/${h}` : `/@${h}`;
}

/** Display form without the scheme: `rout.be/@jona48`, `dlp.li/jona48`. */
export function profileLabel(handle: string, domain: AppDomain = PRIMARY_DOMAIN): string {
  return `${domain}${profilePath(handle, domain)}`;
}

/** Absolute, shareable profile URL. */
export function profileUrl(handle: string, domain: AppDomain = PRIMARY_DOMAIN): string {
  return `https://${profileLabel(handle, domain)}`;
}

/** Both public addresses a member owns the moment they claim a handle. */
export function profileLabels(handle: string): { domain: AppDomain; label: string; url: string }[] {
  return APP_DOMAINS.map((domain) => ({
    domain,
    label: profileLabel(handle, domain),
    url: profileUrl(handle, domain),
  }));
}

/** `jona48@rout.be` / `jona48@dlp.li`. */
export function aliasAddress(handle: string, domain: AppDomain): string {
  return `${cleanHandle(handle)}@${domain}`;
}

export const DOMAIN_LABELS: Record<AppDomain, string> = {
  [PRIMARY_DOMAIN]: "ROUT",
  [SHORT_DOMAIN]: "DLP",
};
