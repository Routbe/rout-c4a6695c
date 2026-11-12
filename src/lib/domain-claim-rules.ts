import { parse } from "tldts";

/** Pure rules for DNS handle claims (db/0119). */
export const DOMAIN_CLAIM_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * Only a registrable apex domain (per the Public Suffix List, private section
 * included) unlocks a handle, so `user.github.io` or `x.vercel.app` never claim
 * a generic name, and subdomains never claim their parent's name.
 */
export function domainClaimHandle(raw: string): { domain: string; handle: string } {
  const input = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  const info = parse(input, { allowPrivateDomains: true });
  if (!info.isIcann && !info.isPrivate) throw new Error("invalid_domain");
  if (info.isIp || !info.domain || !info.domainWithoutSuffix) throw new Error("invalid_domain");
  if (info.isPrivate) throw new Error("private_suffix");
  if (info.domain !== input) throw new Error("not_apex");
  const handle = info.domainWithoutSuffix;
  if (!HANDLE.test(handle)) throw new Error("invalid_handle");
  return { domain: info.domain, handle };
}

export function claimRecordName(domain: string): string {
  return `_rout.${domain}`;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** rout-verify=<base64url(HMAC-SHA256(kek, user_id || domain))> */
export async function claimRecordValue(kek: string, userId: string, domain: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(kek), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${userId}${domain}`)));
  return `rout-verify=${b64url(mac)}`;
}

export type ClaimStatus = "pending" | "verified" | "grace" | "released";

/** Next status after a periodic re-check. */
export function nextClaimStatus(
  current: ClaimStatus,
  recordPresent: boolean,
  failingSince: number | null,
  now: number,
): { status: ClaimStatus; failingSince: number | null } {
  if (recordPresent) return { status: current === "released" ? "released" : "verified", failingSince: null };
  if (current === "pending" || current === "released") return { status: current, failingSince };
  const since = failingSince ?? now;
  return now - since >= DOMAIN_CLAIM_GRACE_MS ? { status: "released", failingSince: since } : { status: "grace", failingSince: since };
}
