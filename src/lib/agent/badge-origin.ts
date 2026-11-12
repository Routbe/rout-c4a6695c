/**
 * Web-badge origin check. Pure. The badge is only "verified" when it is shown
 * on a domain the member registered and verified, or on ROUT itself.
 */
// The Referer header is only compared in memory, never stored or logged (privacy smoke test).
export function requestingHost(origin: string | null, refererHeader: string | null): string | null {
  for (const raw of [origin, refererHeader]) {
    if (!raw || raw === "null") continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.hostname !== "localhost") continue;
      return url.hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      continue;
    }
  }
  return null;
}

/** Exact match or a subdomain of a registered domain (www.example.be ⇢ example.be). */
export function hostMatchesDomains(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => {
    const domain = d.toLowerCase().replace(/\.$/, "");
    return host === domain || host.endsWith(`.${domain}`);
  });
}

export const ROUT_HOSTS = ["rout.be"];
