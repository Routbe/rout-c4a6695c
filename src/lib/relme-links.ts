/**
 * Pure helpers for rel="me" verification links (Mastodon blue check, GitHub)
 * and the workspace subdomain namespace. Browser-safe.
 */

export type RelMeSource = { platform: string; username: string };

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/** "@user@server" (or "user@server") → https://server/@user, else null. */
export function mastodonUrl(username: string): string | null {
  const m = /^@?([a-zA-Z0-9_.-]{1,64})@([a-zA-Z0-9.-]{3,190})$/.exec(username.trim());
  if (!m || !HOST_RE.test(m[2]!)) return null;
  return `https://${m[2]!.toLowerCase()}/@${m[1]}`;
}

/** Joins a Mastodon username and server into the stored "@user@server" form. */
export function mastodonHandle(user: string, server: string): string | null {
  const u = user.trim().replace(/^@+/, "").split("@")[0] ?? "";
  const s = server.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(u) || !HOST_RE.test(s)) return null;
  return `@${u}@${s}`;
}

/** Splits "@user@server" or a https://server/@user URL into its parts. */
export function splitMastodon(raw: string | null | undefined): { user: string; server: string } {
  const value = (raw ?? "").trim();
  const url = /^https:\/\/([^/]+)\/@([^/?#]+)/.exec(value);
  if (url) return { user: url[2]!, server: url[1]! };
  const h = /^@?([^@\s]+)@([^@\s]+)$/.exec(value);
  return h ? { user: h[1]!, server: h[2]! } : { user: "", server: "" };
}

/** rel="me" hrefs for Mastodon and GitHub accounts (deduplicated). */
export function relMeHrefs(sources: RelMeSource[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    if (s.platform === "mastodon") {
      const url = mastodonUrl(s.username);
      if (url) out.add(url);
    } else if (s.platform === "github") {
      const u = s.username.replace(/^@/, "");
      if (/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(u)) out.add(`https://github.com/${u}`);
    }
  }
  return [...out];
}

export type WorkspaceHost = { slug: string } | { domain: string };

/**
 * <slug>.w.rout.be → { slug }; <domain>.rout.be where the prefix itself is a
 * domain (contains a dot, not a .u/.r namespace) → { domain }.
 */
export function workspaceFromHost(host: string | null): WorkspaceHost | null {
  if (!host) return null;
  const clean = (host.split(":")[0] ?? "").toLowerCase().replace(/\.$/, "");
  if (!clean.endsWith(".rout.be")) return null;
  const prefix = clean.slice(0, -".rout.be".length);
  if (prefix.endsWith(".w")) {
    const slug = prefix.slice(0, -2);
    return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug) ? { slug } : null;
  }
  if (!prefix.includes(".") || prefix.endsWith(".u") || prefix.endsWith(".r")) return null;
  return HOST_RE.test(prefix) ? { domain: prefix } : null;
}

/** Bluesky handles a workspace can use on rout.be. */
export function workspaceBlueskyHandles(slug: string, domain: string | null): string[] {
  return [`${slug}.w.rout.be`, ...(domain ? [`${domain}.rout.be`] : [])];
}
