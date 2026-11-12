/** Pure X-Rout-Signature rules: `t=<unix>,v1=<hex hmac-sha256("<t>.<body>")>`. */
export const SIGNATURE_HEADER = "X-Rout-Signature";
export const SIGNATURE_TOLERANCE_SEC = 300;
export const MAX_ATTEMPTS = 8;

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signWebhook(secret: string, body: string, tSec: number): Promise<string> {
  return `t=${tSec},v1=${await hmacHex(secret, `${tSec}.${body}`)}`;
}

/** Receiver-side check (also published in the developer docs). */
export async function verifyWebhook(secret: string, body: string, header: string | null, nowSec: number): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts["t"]);
  const v1 = parts["v1"];
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > SIGNATURE_TOLERANCE_SEC || !v1) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  if (expected.length !== v1.length) return false;
  let d = 0;
  for (let i = 0; i < expected.length; i++) d |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return d === 0;
}

/** Exponential backoff after `attempts` failures: 30 s, 60 s, 120 s ... capped at 6 h; null = give up. */
export function nextRetryDelaySec(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), 6 * 3600);
}
