/** Popular Fediverse servers, always offered even when the live list is unreachable. */
export const POPULAR_MASTODON_SERVERS = [
  "mastodon.social",
  "mastodon.online",
  "mstdn.social",
  "mas.to",
  "mastodon.world",
  "fosstodon.org",
  "toot.community",
  "mastodon.nl",
  "mstdn.be",
  "mastodon.art",
  "infosec.exchange",
  "techhub.social",
  "hachyderm.io",
  "social.vivaldi.net",
  "piaille.fr",
  "chaos.social",
];

/** Up to `limit` suggestions: prefix matches first, then contains-matches. */
export function filterMastodonServers(query: string, extra: string[] = [], limit = 8): string[] {
  const q = (query || "").trim().toLowerCase().replace(/^.*@/, "").replace(/^https?:\/\//, "");
  const all = Array.from(new Set([...POPULAR_MASTODON_SERVERS, ...extra.map((s) => s.toLowerCase())]));
  if (!q) return all.slice(0, limit);
  const starts = all.filter((s) => s.startsWith(q));
  const contains = all.filter((s) => !s.startsWith(q) && s.includes(q));
  return [...starts, ...contains].filter((s) => s !== q).slice(0, limit);
}
