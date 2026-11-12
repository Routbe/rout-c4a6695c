/**
 * Signed one-click review links for admin e-mails (approve / reject).
 *
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256). The link
 * opens a confirmation page — a GET never changes anything, so mail scanners
 * that prefetch links cannot approve a request. The decision itself only
 * applies while the request is still open, which makes every link single-use.
 */
import { resolveAuthSecret } from "@/lib/better-auth.server";

export type ReviewKind = "influencer" | "business";
export type ReviewAction = "approve" | "reject";
export type ReviewPayload = { k: ReviewKind; r: string; a: ReviewAction; e: number };

export const REVIEW_LINK_TTL_DAYS = 14;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function secret(): string {
  const direct = process.env["REVIEW_LINK_SECRET"];
  if (direct && direct.length >= 32) return direct;
  const auth = resolveAuthSecret();
  if (!auth) throw new Error("No signing secret available for review links.");
  return `review-links:${auth.secret}`;
}

async function hmac(data: string, key = secret()): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

export async function signReviewToken(
  p: Omit<ReviewPayload, "e">,
  opts: { now?: number; key?: string } = {},
): Promise<string> {
  const payload: ReviewPayload = { ...p, e: (opts.now ?? Date.now()) + REVIEW_LINK_TTL_DAYS * 86_400_000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await hmac(body, opts.key))}`;
}

export async function verifyReviewToken(
  token: string,
  opts: { now?: number; key?: string } = {},
): Promise<ReviewPayload | null> {
  try {
    const [body, sig] = String(token).split(".");
    if (!body || !sig) return null;
    const expected = b64url(await hmac(body, opts.key));
    if (expected.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as ReviewPayload;
    if (p.k !== "influencer" && p.k !== "business") return null;
    if (p.a !== "approve" && p.a !== "reject") return null;
    if (typeof p.r !== "string" || typeof p.e !== "number") return null;
    if (p.e < (opts.now ?? Date.now())) return null;
    return p;
  } catch {
    return null;
  }
}
