/**
 * Keyed hashing for anonymous Q&A and rate limits. Server-only.
 *
 * One master secret (QA_HMAC_SECRET) is split into purpose keys with HMAC, so
 * sender keys, abuse keys and rate-limit buckets can never be compared with
 * each other. Without the secret, nothing stored can be reversed to an IP,
 * device or account; abuse and rate-limit keys also rotate on their own.
 */
import { abuseEpoch, dayEpoch } from "./privacy-keys";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(key: Uint8Array | string, message: string): Promise<Uint8Array> {
  const raw = new Uint8Array(typeof key === "string" ? enc.encode(key) : key);
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

function master(): string | null {
  const s = process.env["QA_HMAC_SECRET"]?.trim();
  return s && s.length >= 32 ? s : null;
}

async function purposeKey(label: string): Promise<Uint8Array> {
  const m = master();
  if (!m) throw new Error("QA_HMAC_SECRET missing");
  return hmac(m, `rout:purpose:${label}`);
}

export function hasPrivacySecret(): boolean {
  return master() !== null;
}

async function keyed(label: string, message: string): Promise<string> {
  return hex((await hmac(await purposeKey(label), message)).buffer as ArrayBuffer);
}

/** Base keys the database scopes to one recipient canvas before storing. */
export async function senderBaseKeys(deviceSecret: string | null, userId: string | null) {
  return {
    device: deviceSecret ? await keyed("qa-sender", `device:${deviceSecret}`) : null,
    account: userId ? await keyed("qa-sender", `acct:${userId}`) : null,
  };
}

/** Global abuse key (current + previous 30-day epoch); an account wins over a device. */
export async function abuseKeys(deviceSecret: string | null, userId: string | null, nowMs = Date.now()) {
  const who = userId ? `acct:${userId}` : deviceSecret ? `device:${deviceSecret}` : null;
  if (!who) return { now: null, prev: null };
  const e = abuseEpoch(nowMs);
  return { now: await keyed(`qa-abuse:${e}`, who), prev: await keyed(`qa-abuse:${e - 1}`, who) };
}

/** Daily-rotating network key of the person pressing "mute" (anti-mob). */
export async function muterNetKey(ip: string, nowMs = Date.now()): Promise<string | null> {
  if (!ip || ip === "unknown") return null;
  return keyed(`qa-muter-net:${dayEpoch(nowMs)}`, ip);
}

/**
 * Rate-limit bucket subject: daily-rotating keyed hash. Without the secret it
 * falls back to a plain digest so sign-in limits never lock everyone out.
 */
export async function rateLimitKey(name: string, subject: string, nowMs = Date.now()): Promise<string> {
  if (master()) return keyed(`rate:${dayEpoch(nowMs)}`, `${name}:${subject}`);
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`${name}:${subject}`));
  return hex(d);
}
