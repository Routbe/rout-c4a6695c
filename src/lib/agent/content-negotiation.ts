/**
 * Headless Profile Hub: decides when a profile URL answers with JSON instead
 * of the React page. Pure.
 *
 * - Explicit `Accept: application/json` or `application/ld+json` → JSON.
 * - User-triggered AI agents (a person asked their assistant to open the page)
 *   → JSON. Search crawlers (GPTBot, ClaudeBot, Googlebot…) keep the HTML page,
 *   which already carries JSON-LD, so search visibility does not change.
 * - `application/activity+json` is left to the Fediverse handlers.
 */
const AGENT_FETCHERS = /\b(ChatGPT-User|Claude-User|Claude-Web|Perplexity-User|MistralAI-User|Lovable-Agent|Cursor)\b/i;

export function wantsMachineProfile(accept: string | null, userAgent: string | null): boolean {
  const a = (accept ?? "").toLowerCase();
  if (a.includes("application/activity+json")) return false;
  const types = a.split(",").map((t) => t.split(";")[0]!.trim());
  if (types.includes("application/json") || types.includes("application/ld+json")) {
    // A browser that lists text/html first still gets the page.
    const htmlIndex = types.indexOf("text/html");
    const jsonIndex = Math.min(...["application/json", "application/ld+json"].map((t) => (types.includes(t) ? types.indexOf(t) : Infinity)));
    return htmlIndex === -1 || jsonIndex < htmlIndex;
  }
  return AGENT_FETCHERS.test(userAgent ?? "");
}

const RESERVED_FIRST_SEGMENTS = new Set([
  "api", "dashboard", "studio", "auth", "oauth", "connect", "claim", "act", "w", "u", "docs", "about", "pricing",
  "press", "contact", "dev", "terms", "privacy", "manifesto", "qr", "account", "support", "product", "developer",
]);

export type ProfilePath = { space: "verified" | "alias"; handle: string };

/** `/<handle>` or `/u/<alias>` (optionally with a leading @), nothing deeper. */
export function matchProfilePath(pathname: string): ProfilePath | null {
  const alias = /^\/u\/@?([a-z0-9._-]{2,60})\/?$/i.exec(pathname);
  if (alias) return { space: "alias", handle: alias[1]!.toLowerCase() };
  const root = /^\/@?([a-z0-9._-]{2,60})\/?$/i.exec(pathname);
  if (!root) return null;
  const handle = root[1]!.toLowerCase();
  if (RESERVED_FIRST_SEGMENTS.has(handle) || handle.includes(".")) return null;
  return { space: "verified", handle };
}
