/**
 * Universele SSRF-guard voor uitgaande server-side requests.
 *
 * `validateOutboundUrl` moet vóór ELK uitgaand fetch-verzoek worden aangeroepen
 * (Mastodon, webhooks, avatar-fetchers, calendar-syncs, link previews):
 * - alleen https:// (blokkeert http, file, gopher, ftp, ...)
 * - geldig publiek domeinformaat
 * - DNS-resolutie met blokkade van loopback, privé-, link-local- en
 *   cloud-metadata-adressen (via safe-fetch's assertPublicHost)
 *
 * `guardedOutboundFetch` voegt daar een strikte 5s-timeout aan toe.
 */
import { assertPublicHost } from "@/lib/safe-fetch.server";

export const OUTBOUND_TIMEOUT_MS = 5000;

export class SsrfBlockedError extends Error {
  readonly status = 400;
  constructor(message = "Invalid or restricted host") {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

/**
 * Valideert een uitgaande URL. Gooit `SsrfBlockedError` bij elke afwijking.
 * Retourneert de genormaliseerde URL bij succes.
 */
export async function validateOutboundUrl(targetUrl: string, signal?: AbortSignal): Promise<URL> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new SsrfBlockedError("Invalid URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new SsrfBlockedError("Only https:// URLs are allowed");
  }
  const host = url.hostname.toLowerCase();
  // Domeinformaat (letterlijk IP wordt apart via assertPublicHost gecheckt).
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(":") && !DOMAIN_RE.test(host)) {
    throw new SsrfBlockedError("Invalid host name");
  }
  if (url.port && url.port !== "443") {
    throw new SsrfBlockedError("Non-standard ports are not allowed");
  }
  if (!(await assertPublicHost(host, signal))) {
    throw new SsrfBlockedError("Invalid or restricted host");
  }
  return url;
}

/**
 * Fetch met SSRF-guard én strikte timeout (max 5s). Redirects worden niet
 * automatisch gevolgd: de caller controleert elke nieuwe host opnieuw.
 */
export async function guardedOutboundFetch(
  targetUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = await validateOutboundUrl(targetUrl);
  return fetch(url.toString(), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
}
