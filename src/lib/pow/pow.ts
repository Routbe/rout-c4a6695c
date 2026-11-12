/**
 * Deterministic, scoped proof-of-work (no CAPTCHA, no third party).
 *
 * Challenge: `v2.<scope>.<expires unix s>.<bits>.<nonce b64url>.<hmac b64url>`
 * (stateless, HMAC-signed by the server). Work: find a `solution`
 * ([0-9A-Za-z]{1,64}) such that sha256(challenge + ":" + solution) starts with
 * `bits` zero bits. Each challenge is single-use (replays are refused server-side).
 */
const enc = new TextEncoder();

export const POW_SCOPES = ["vault", "workspace"] as const;
export type PowScope = (typeof POW_SCOPES)[number];
/** ~1M hashes on average: a second or two for one agent, expensive at spam scale. */
export const POW_BITS: Record<PowScope, number> = { vault: 20, workspace: 20 };
export const POW_CHALLENGE_TTL_S = 10 * 60;
export const POW_CHALLENGE_HEADER = "x-rout-pow-challenge";
export const POW_SOLUTION_HEADER = "x-rout-pow-solution";
const SOLUTION_RE = /^[0-9A-Za-z]{1,64}$/;

export const isPowScope = (v: unknown): v is PowScope => typeof v === "string" && (POW_SCOPES as readonly string[]).includes(v);

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function leadingZeroBits(hexDigest: string): number {
  let bits = 0;
  for (const c of hexDigest) {
    const n = parseInt(c, 16);
    if (n === 0) {
      bits += 4;
      continue;
    }
    return bits + (Math.clz32(n) - 28);
  }
  return bits;
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`rout-pow:v2:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function signPowChallenge(secret: string, scope: PowScope, nowS: number, nonce: Uint8Array): Promise<string> {
  const body = `v2.${scope}.${nowS + POW_CHALLENGE_TTL_S}.${POW_BITS[scope]}.${b64url(nonce)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export type PowCheck =
  | { ok: true; expiresAt: number }
  | { ok: false; reason: "missing" | "invalid" | "wrong_scope" | "expired" | "weak" };

export async function verifyPow(secret: string, scope: PowScope, challenge: string, solution: string, nowS: number): Promise<PowCheck> {
  if (!challenge || !solution) return { ok: false, reason: "missing" };
  if (challenge.length > 300 || !SOLUTION_RE.test(solution)) return { ok: false, reason: "invalid" };
  const parts = challenge.split(".");
  if (parts.length !== 6 || parts[0] !== "v2") return { ok: false, reason: "invalid" };
  const expected = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(parts.slice(0, 5).join(".")))));
  const given = parts[5]!;
  if (given.length !== expected.length) return { ok: false, reason: "invalid" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: "invalid" };
  if (parts[1] !== scope) return { ok: false, reason: "wrong_scope" };
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < nowS) return { ok: false, reason: "expired" };
  const bits = Number(parts[3]);
  if (bits < POW_BITS[scope]) return { ok: false, reason: "weak" };
  if (leadingZeroBits(await sha256Hex(`${challenge}:${solution}`)) < bits) return { ok: false, reason: "weak" };
  return { ok: true, expiresAt: exp };
}

/** Reference solver (tests, docs). Agents implement the same loop natively. */
export async function solvePow(challenge: string, maxTries = 50_000_000): Promise<string> {
  const bits = Number(challenge.split(".")[3]);
  for (let i = 0; i < maxTries; i++) {
    const s = i.toString(36);
    if (leadingZeroBits(await sha256Hex(`${challenge}:${s}`)) >= bits) return s;
  }
  throw new Error("pow_unsolved");
}
