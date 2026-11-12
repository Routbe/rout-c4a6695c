/** Browser-safe validation + routing rules for the Connections Hub. */
import { integrationById } from "./integrations-catalog";
import { DUOLINGO_USER } from "./duolingo-rules";
import { normalizeFeed, normalizeMastodon } from "./open-web-rules";

export type Audience = "pro" | "social" | "both";
export const AUDIENCES: Audience[] = ["pro", "social", "both"];

const USER = /^[A-Za-z0-9](?:[A-Za-z0-9-_.]{0,38})$/;
const AT_HANDLE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Returns the normalized handle/address, or null when it is not acceptable. */
export function normalizeIntegrationValue(provider: string, raw: string): string | null {
  const item = integrationById(provider);
  if (!item || item.mode === "soon" || item.mode === "oauth") return null;
  const v = String(raw ?? "").trim();
  if (!v || v.length > 200) return null;
  switch (provider) {
    case "github":
    case "gitlab":
    case "wakatime": {
      const h = v.replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/.*$/, "");
      return USER.test(h) ? h : null;
    }
    case "chesscom":
    case "lichess": {
      const h = v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(chess\.com\/member|lichess\.org\/@)\//i, "").replace(/\/.*$/, "");
      return /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(h) ? h : null;
    }
    case "duolingo": {
      const h = v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?duolingo\.com\/profile\//i, "").replace(/[/?#].*$/, "");
      return DUOLINGO_USER.test(h) ? h : null;
    }
    case "bluesky":
    case "wsocial": {
      let h = v.toLowerCase().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(bsky\.app|wsocial\.eu)\/profile\//, "").replace(/\/.*$/, "");
      if (!h.includes(".")) h = `${h}.${provider === "bluesky" ? "bsky.social" : "wsocial.eu"}`;
      return AT_HANDLE.test(h) ? h : null;
    }
    case "mastodon":
      return normalizeMastodon(v);
    case "rss":
      return normalizeFeed(v);
    case "youtube": {
      const h = v.replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/^channel\//, "").replace(/\/.*$/, "");
      if (/^UC[A-Za-z0-9_-]{22}$/.test(h)) return h;
      const handle = h.startsWith("@") ? h : `@${h}`;
      return /^@[A-Za-z0-9._-]{3,30}$/.test(handle) ? handle : null;
    }
    case "ethereum":
      return /^0x[a-fA-F0-9]{40}$/.test(v) ? v : null;
    case "monero":
      return /^[48][1-9A-HJ-NP-Za-km-z]{94}$/.test(v) || /^4[1-9A-HJ-NP-Za-km-z]{105}$/.test(v) ? v : null;
    case "lightning": {
      const l = v.toLowerCase();
      if (/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(l)) return l;
      return /^lnurl1[02-9ac-hj-np-z]{20,}$/.test(l) ? l : null;
    }
    default:
      return null;
  }
}

/** Which cards a visitor sees on the Pro or Social face of a profile. */
export function visibleForMode<T extends { audience: Audience }>(rows: T[], mode: "pro" | "social" | null): T[] {
  if (!mode) return rows;
  return rows.filter((r) => r.audience === "both" || r.audience === mode);
}

/** Payment URI used for the QR code / support button. */
export function paymentUri(provider: string, value: string): string | null {
  if (provider === "ethereum") return `ethereum:${value}`;
  if (provider === "monero") return `monero:${value}`;
  if (provider === "lightning") return `lightning:${value}`;
  return null;
}
