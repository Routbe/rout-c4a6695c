import { normalizeRedirectUri } from "./redirect-match";

type ClientLike = { clientId: string; name: string; redirectUris: string[] };

/**
 * For each client, the names of the owner's OTHER apps that register the same
 * redirect URI. Duplicates make a site silently use the wrong client_id
 * (e.g. one still in test mode, or with another secret).
 */
export function findSharedRedirects(clients: ClientLike[]): Record<string, string[]> {
  const byUri = new Map<string, ClientLike[]>();
  for (const c of clients) {
    for (const u of new Set(c.redirectUris.map((r) => normalizeRedirectUri(r) ?? r))) {
      byUri.set(u, [...(byUri.get(u) ?? []), c]);
    }
  }
  const out: Record<string, string[]> = {};
  for (const group of byUri.values()) {
    if (group.length < 2) continue;
    for (const c of group) {
      const others = group.filter((o) => o.clientId !== c.clientId).map((o) => o.name);
      out[c.clientId] = [...new Set([...(out[c.clientId] ?? []), ...others])];
    }
  }
  return out;
}
