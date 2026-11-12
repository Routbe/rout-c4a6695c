import { z } from "zod";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { relMeHrefs, type RelMeSource } from "./relme-links";

export const mastodonProfileSchema = z.string().trim().max(200).transform((raw, ctx) => {
  if (!raw) return "";
  const handle = /^@?([a-zA-Z0-9_.-]+)@([a-zA-Z0-9.-]+)$/.exec(raw);
  try {
    const url = new URL(handle ? `https://${handle[2]}/@${handle[1]}` : raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(url.hostname) ||
      !/^\/@[a-zA-Z0-9_.-]+\/?$/.test(url.pathname)) throw new Error();
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch {
    ctx.addIssue({ code: "custom", message: "Vul een volledige Mastodon-handle of HTTPS-profiel-URL in." });
    return z.NEVER;
  }
});

export type FediverseIdentity = { url: string; verified: boolean };
export function fediverseHeadLinks(identity: FediverseIdentity | null | undefined, social?: unknown) {
  const parsed = mastodonProfileSchema.safeParse(identity?.url);
  const out = parsed.success && parsed.data ? [{ rel: "me", href: parsed.data }] : [];
  // Verified GitHub accounts also get rel="me" (IndieWeb / Mastodon chains).
  const github = Array.isArray(social)
    ? relMeHrefs(social.filter((s): s is RelMeSource => !!s && typeof s === "object" && (s as RelMeSource).platform === "github" && typeof (s as RelMeSource).username === "string"))
    : [];
  return [...out, ...github.map((href) => ({ rel: "me", href }))];
}

/** Parse real anchors/links, excluding comments, scripts, and lookalike URLs. */
export function hasReciprocalLink(html: string, expected: string[], base: string): boolean {
  const canonical = (raw: string) => {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  };
  const allowed = new Set(expected.map(canonical));
  const walk = (node: DefaultTreeAdapterMap["node"]): boolean => {
    if (node.nodeName === "script" || node.nodeName === "template") return false;
    if (node.nodeName === "a" || node.nodeName === "link") {
      const attrs = "attrs" in node ? node.attrs ?? [] : [];
      const href = attrs.find(a => a.name === "href")?.value;
      const rel = attrs.find(a => a.name === "rel")?.value.toLowerCase().split(/\s+/) ?? [];
      if (href && rel.includes("me")) {
        try { const url = canonical(href); if (url && allowed.has(url)) return true; } catch { /* invalid URL */ }
      }
    }
    return "childNodes" in node && node.childNodes.some(walk);
  };
  return walk(parse(html));
}

export function assertVerifiedOwner(user: { id: string; emailConfirmedAt: string | null } | null, ownerId: string) {
  if (!user) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  if (user.id !== ownerId || !user.emailConfirmedAt) throw Object.assign(new Error("Bevestig eerst je e-mailadres."), { statusCode: 403 });
}
/** Splits a saved Mastodon URL or @user@server handle into the two form fields. */
export function splitMastodonHandle(raw: string | null | undefined): { user: string; server: string } {
  const value = (raw ?? "").trim();
  const handle = /^@?([a-zA-Z0-9_.-]+)@([a-zA-Z0-9.-]+\.[a-z]{2,})$/i.exec(value);
  if (handle) return { user: handle[1], server: handle[2].toLowerCase() };
  try {
    const url = new URL(value);
    const user = /^\/@([a-zA-Z0-9_.-]+)\/?$/.exec(url.pathname)?.[1];
    if (user) return { user, server: url.hostname.toLowerCase() };
  } catch { /* not a URL */ }
  return { user: value.replace(/^@/, ""), server: "" };
}

/** Joins the two form fields into the @user@server handle the save schema accepts. */
export function joinMastodonHandle(user: string, server: string): string {
  const u = user.trim().replace(/^@/, "").replace(/@.*$/, "");
  const s = server.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return u && s ? `@${u}@${s}` : "";
}
