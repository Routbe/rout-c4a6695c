/**
 * ALTCHA — self-hosted proof-of-work bot check (no Cloudflare, no Google).
 *
 * Protocol (ALTCHA v1, SHA-256):
 *   salt      = random hex + "?expires=<unix>&d=<n|h>"
 *   challenge = sha256hex(salt + secretNumber)          (secretNumber ≤ maxnumber)
 *   signature = hmacSha256hex(ALTCHA_HMAC_KEY, challenge)
 * The browser brute-forces the number and sends back base64(JSON) with
 * { algorithm, challenge, number, salt, signature }. Expiry and difficulty live
 * in the salt, so they are covered by the hash + signature and cannot be faked.
 * Every accepted signature is stored once in `public.altcha_used` (db/54):
 * a proof can never be replayed.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/neon";

export const ALTCHA_DEFAULT_MAX = 50_000;
export const ALTCHA_HARD_MAX = 500_000;
const TTL_SECONDS = 300;
/** Same salt the browser uses for the sign-in throttle key (src/lib/signin-guard.ts). */
const THROTTLE_SALT = "rout:signin-guard:v1";
const HARD_AFTER_FAILURES = 3;

export interface AltchaChallenge {
  algorithm: "SHA-256";
  challenge: string;
  salt: string;
  signature: string;
  maxnumber: number;
}

export type AltchaResult = { ok: true } | { ok: false; reason: string };

let warnedDerived = false;

/**
 * ALTCHA_HMAC_KEY, or a key derived from another server-only secret (auth secret, then the
 * database URL). Never a value from the source tree: with no secret at all the bot check is
 * not configured and fails closed, because a public constant would let anyone forge proofs.
 */
async function hmacKey(): Promise<string | null> {
  const direct = process.env["ALTCHA_HMAC_KEY"];
  if (direct && direct.length >= 16) return direct;
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const dbUrl = process.env["DATABASE_URL"];
  const seed = resolveAuthSecret()?.secret ?? (dbUrl && dbUrl.length >= 16 ? dbUrl : null);
  if (!seed) {
    console.error("[altcha] No ALTCHA_HMAC_KEY, BETTER_AUTH_SECRET or DATABASE_URL set: bot check refuses all proofs.");
    return null;
  }
  if (!warnedDerived) {
    warnedDerived = true;
    console.warn("[altcha] ALTCHA_HMAC_KEY not set — using a key derived from the auth secret.");
  }
  return createHash("sha256").update(`rout-altcha:${seed}`).digest("hex");
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createAltchaChallenge(opts: { hard?: boolean } = {}): Promise<AltchaChallenge> {
  // Lazy cleanup instead of an hourly cron: ~5% of challenges purge expired replay rows, non-blocking.
  if (Math.random() < 0.05) void purgeExpiredAltcha().catch(() => undefined);
  const maxnumber = opts.hard ? ALTCHA_HARD_MAX : ALTCHA_DEFAULT_MAX;
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const salt = `${randomBytes(12).toString("hex")}?expires=${expires}&d=${opts.hard ? "h" : "n"}`;
  const challenge = sha256(salt + randomInt(0, maxnumber + 1));
  const key = await hmacKey();
  if (!key) throw new Error("altcha_not_configured");
  const signature = createHmac("sha256", key).update(challenge).digest("hex");
  return { algorithm: "SHA-256", challenge, salt, signature, maxnumber };
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checks a proof (base64 JSON). Consumes it on success, so it works exactly once. */
export async function verifyAltcha(
  payload: string | null | undefined,
  opts: { requireHard?: boolean } = {},
): Promise<AltchaResult> {
  if (!payload) return { ok: false, reason: "missing" };
  let p: { algorithm?: unknown; challenge?: unknown; number?: unknown; salt?: unknown; signature?: unknown };
  try {
    p = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const { algorithm, challenge, number, salt, signature } = p;
  if (
    algorithm !== "SHA-256" ||
    typeof challenge !== "string" ||
    typeof salt !== "string" ||
    typeof signature !== "string" ||
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number < 0 ||
    number > ALTCHA_HARD_MAX
  ) {
    return { ok: false, reason: "malformed" };
  }

  const params = new URLSearchParams(salt.split("?")[1] ?? "");
  const expires = Number(params.get("expires"));
  if (!expires || expires * 1000 < Date.now()) return { ok: false, reason: "expired" };
  if (opts.requireHard && params.get("d") !== "h") return { ok: false, reason: "too_easy" };

  const key = await hmacKey();
  if (!key) return { ok: false, reason: "not_configured" };
  const expected = createHmac("sha256", key).update(challenge).digest("hex");
  if (!safeEqualHex(expected, signature)) return { ok: false, reason: "bad_signature" };
  if (!safeEqualHex(sha256(salt + number), challenge)) return { ok: false, reason: "bad_solution" };

  try {
    // db/54 owns the table: the least-privilege login role must never run DDL.
    const insert = () => sql`
      insert into public.altcha_used (signature, expires_at)
      values (${signature}, to_timestamp(${expires}))
      on conflict (signature) do nothing
      returning signature
    `;
    let rows: unknown[];
    try {
      rows = (await insert()) as unknown as unknown[];
    } catch {
      // One immediate retry: a transient gateway/network blip must never turn
      // a valid, freshly solved proof into a failed sign-in.
      rows = (await insert()) as unknown as unknown[];
    }
    if (rows.length === 0) return { ok: false, reason: "replayed" };
  } catch (err) {
    console.error("[ALTCHA Error]: replay store unavailable:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "store_unavailable" };
  }
  return { ok: true };
}

/** Throws a readable error when the proof is missing or invalid (server functions). */
export async function assertHuman(payload: string | null | undefined) {
  const result = await verifyAltcha(payload);
  if (!result.ok) throw new Error("Botcontrole mislukt. Herlaad de pagina en probeer opnieuw.");
}

export function throttleHashForEmail(email: string): string {
  return sha256(`${THROTTLE_SALT}|${email.trim().toLowerCase()}`);
}

/** True after ≥3 recent failed attempts for this identity (existing signin_throttle). */
export async function identityNeedsHardChallenge(identityHash: string | null | undefined): Promise<boolean> {
  if (!identityHash) return false;
  try {
    const rows = (await sql`
      select failures from public.signin_throttle
       where identity_hash = ${identityHash}
         and window_started_at > now() - interval '15 minutes'
    `) as Array<{ failures?: number }>;
    return Number(rows[0]?.failures ?? 0) >= HARD_AFTER_FAILURES;
  } catch {
    return false;
  }
}

/** Deletes expired replay rows (cron). */
export async function purgeExpiredAltcha(): Promise<{ deleted: number }> {
  const rows = (await sql`delete from public.altcha_used where expires_at < now() returning 1`) as unknown[];
  return { deleted: rows.length };
}
