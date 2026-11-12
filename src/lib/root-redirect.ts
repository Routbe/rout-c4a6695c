/** Pure rules for the root "/" of a member's custom domain (db/0128). */
export const ROUT_MAIN_URL = "https://rout.be";
export const ROOT_REDIRECT_TYPES = ["profile_hub", "custom_url", "rout_main", "none"] as const;
export type RootRedirectType = (typeof ROOT_REDIRECT_TYPES)[number];

/** Only absolute https URLs to a public-looking host; no credentials, no IPs or localhost. */
export function validRootRedirectUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  return u.toString();
}

/**
 * Where "/" on a custom domain goes: a 302 target, or null to render normally
 * (type "none", or no domain row).
 */
export function rootRedirectTarget(input: {
  type: RootRedirectType | null;
  url: string | null;
  profileHandle: string | null;
  origin?: string;
}): string | null {
  const origin = input.origin ?? ROUT_MAIN_URL;
  switch (input.type) {
    case "profile_hub":
      return input.profileHandle ? `${origin}/${encodeURIComponent(input.profileHandle)}` : ROUT_MAIN_URL;
    case "custom_url":
      return validRootRedirectUrl(input.url) ?? ROUT_MAIN_URL;
    case "rout_main":
      return ROUT_MAIN_URL;
    default:
      return null;
  }
}

export function isCustomDomainHost(host: string): boolean {
  const clean = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return Boolean(clean) && !/(^|\.)(rout\.be|rout\.app|lovable\.app|lovableproject\.com|localhost)$/.test(clean) && !/^[\d.]+$/.test(clean);
}
