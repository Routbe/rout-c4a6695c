import { z } from "zod";
import { WORKSPACE_PERSONAL_ONLY_PREFS } from "@/lib/workspace-studio";

/**
 * Pure rules for account-less AI agent sandboxes. Browser-safe: WebCrypto
 * only, no env reads, no I/O.
 *
 * Flow: challenge (signed, 10 min) → proof-of-work → sandbox key (24 h) →
 * one unowned workspace + login-app specs + Studio draft → a human claims it
 * with the link, the QR code (same link) or the typed claim code.
 *
 * Zero-trust rules:
 * - Sandbox keys and claim codes are random; only SHA-256 hashes are stored.
 * - A sandbox key reaches exactly one unclaimed workspace and dies at claim.
 * - Login apps are stored as specs only; real OAuth clients are created at
 *   claim time with the claiming human as owner, so nothing can sign in early.
 */

export const SANDBOX_TTL_HOURS = 24;
export const SANDBOX_KEY_PREFIX = "rsk_";
export const SANDBOX_KEY_PATTERN = /^rsk_[0-9a-f]{64}$/;
export const POW_DIFFICULTY_BITS = 20;
export const POW_TTL_S = 10 * 60;
export const MAX_SANDBOX_APPS = 3;

const enc = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export function generateSandboxKey(randomBytes: (n: number) => Uint8Array): string {
  return SANDBOX_KEY_PREFIX + hex(randomBytes(32));
}

export function isSandboxKey(value: string): boolean {
  return SANDBOX_KEY_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Claim code: 24 Crockford base32 symbols (120 bits) + 1 check symbol,
// shown as ROUT-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX.
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CLAIM_CODE_SYMBOLS = 24;

function checkSymbol(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum = (sum * 33 + CROCKFORD.indexOf(body[i]!) + 1) % 1_000_003;
  return CROCKFORD[sum % 32]!;
}

export function generateClaimCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(CLAIM_CODE_SYMBOLS);
  let body = "";
  for (const b of bytes) body += CROCKFORD[b & 31];
  return formatClaimCode(body + checkSymbol(body));
}

export function formatClaimCode(raw: string): string {
  const groups = raw.match(/.{1,5}/g) ?? [];
  return `ROUT-${groups.join("-")}`;
}

/** Uppercase, strip prefix/spaces/hyphens, map look-alikes (O→0, I/L→1). Null if malformed or checksum fails. */
export function normalizeClaimCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.startsWith("ROUT")) s = s.slice(4);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== CLAIM_CODE_SYMBOLS + 1) return null;
  if ([...s].some((c) => !CROCKFORD.includes(c))) return null;
  const body = s.slice(0, CLAIM_CODE_SYMBOLS);
  return checkSymbol(body) === s[CLAIM_CODE_SYMBOLS] ? s : null;
}

/** Hash input for storage/lookup; namespaced so a code hash can never equal a link-token hash. */
export function claimCodeHashInput(normalized: string): string {
  return `rout-claim-code:${normalized}`;
}

/** What the human typed or scanned: a claim link, a bare link token, or a claim code. */
export type ClaimInput = { kind: "token"; token: string } | { kind: "code"; code: string } | null;

export function parseClaimInput(raw: string): ClaimInput {
  const v = raw.trim();
  const link = /\/claim\/workspace\/([0-9a-f]{64})(?:[/?#]|$)/.exec(v);
  if (link) return { kind: "token", token: link[1]! };
  if (/^[0-9a-f]{64}$/.test(v)) return { kind: "token", token: v };
  const code = normalizeClaimCode(v);
  return code ? { kind: "code", code } : null;
}

// ---------------------------------------------------------------------------
// Proof-of-work challenge (stateless, HMAC-signed)
// ---------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function powKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`rout-agent-pow:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function signChallenge(secret: string, nowS: number, nonce: Uint8Array, bits = POW_DIFFICULTY_BITS): Promise<string> {
  const body = `v1.${nowS + POW_TTL_S}.${bits}.${b64url(nonce)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await powKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
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

export type ChallengeCheck = { ok: true } | { ok: false; reason: "invalid" | "expired" | "weak" };

/** Valid signature, unexpired, and sha256(challenge + ":" + solution) has the demanded zero bits. */
export async function verifyChallenge(secret: string, challenge: string, solution: string, nowS: number): Promise<ChallengeCheck> {
  if (challenge.length > 300 || !/^[0-9a-zA-Z]{1,64}$/.test(solution)) return { ok: false, reason: "invalid" };
  const parts = challenge.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return { ok: false, reason: "invalid" };
  const body = parts.slice(0, 4).join(".");
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", await powKey(secret), enc.encode(body)));
  const given = parts[4]!;
  const exp = b64url(expected);
  if (given.length !== exp.length) return { ok: false, reason: "invalid" };
  let diff = 0;
  for (let i = 0; i < exp.length; i++) diff |= exp.charCodeAt(i) ^ given.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: "invalid" };
  if (Number(parts[1]) < nowS) return { ok: false, reason: "expired" };
  const bits = Number(parts[2]);
  if (leadingZeroBits(await sha256Hex(`${challenge}:${solution}`)) < bits) return { ok: false, reason: "weak" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inputs (strict: unknown fields — e-mail included — are rejected)
// ---------------------------------------------------------------------------

export const sandboxRegisterInput = z.strictObject({
  challenge: z.string().min(10).max(300),
  solution: z.string().regex(/^[0-9a-zA-Z]{1,64}$/),
  agent_name: z.string().trim().min(1).max(80),
});

const httpsUrl = z.string().trim().max(500).url().refine((u) => u.startsWith("https://"), "must be https");

export const sandboxAppInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  homepage_url: httpsUrl.optional(),
  privacy_url: httpsUrl.optional(),
  terms_url: httpsUrl.optional(),
  redirect_uris: z
    .array(z.string().trim().max(500).refine((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), "https (or http://localhost)"))
    .min(1)
    .max(10),
  scopes: z.array(z.enum(["openid", "profile", "email"])).max(3).default(["openid", "profile"]),
});
export type SandboxAppSpec = z.infer<typeof sandboxAppInput>;

export const sandboxAppsInput = z.strictObject({ apps: z.array(sandboxAppInput).max(MAX_SANDBOX_APPS) });

const BLOCK_KINDS = ["link", "text", "heading", "divider", "contact", "social"] as const;
const shortText = (max: number) => z.string().max(max);

export const sandboxBlockInput = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  kind: z.enum(BLOCK_KINDS),
  label: shortText(120).optional(),
  value: shortText(500).optional(),
  style: z.record(z.string().regex(/^[a-zA-Z]{1,30}$/), z.union([shortText(80), z.number(), z.boolean()])).optional(),
});

const PERSONAL = new Set<string>(WORKSPACE_PERSONAL_ONLY_PREFS);
const prefValue = z.union([shortText(200), z.number().finite(), z.boolean(), z.null()]);

export const sandboxProfileInput = z.strictObject({
  displayName: shortText(120).nullable().optional(),
  tagline: shortText(240).nullable().optional(),
  theme: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  cardStyle: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  blocks: z.array(sandboxBlockInput).max(50).optional(),
  displayPrefs: z
    .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/), prefValue)
    .refine((p) => Object.keys(p).length <= 60, "max 60 preferences")
    .refine((p) => !Object.keys(p).some((k) => PERSONAL.has(k)), "personal-only preferences are not allowed on a workspace")
    .optional(),
});
export type SandboxProfileInput = z.infer<typeof sandboxProfileInput>;

/** Split a profile input into the draft fields and the displayPrefs patch. */
export function splitProfilePatch(input: SandboxProfileInput): { fields: Record<string, unknown>; prefs: Record<string, unknown> } {
  const { displayPrefs, ...fields } = input;
  return { fields, prefs: displayPrefs ?? {} };
}
