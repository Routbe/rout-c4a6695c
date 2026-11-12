/**
 * Encryption at rest for unclaimed agent designs (server-side, WebCrypto only).
 *
 * Envelope encryption: every sandbox workspace gets a random 256-bit data key
 * (DK). The draft and the login-app specs are sealed with AES-256-GCM under
 * DK. DK itself is never stored: only three wraps of it, each under a key
 * derived (HKDF-SHA-256) from a secret the server keeps nowhere —
 *   key   → the agent's `rsk_` sandbox key (the agent can keep editing),
 *   token → the claim link token,
 *   code  → the normalised claim code.
 * The database therefore holds ciphertext and hashes only; plaintext exists
 * in memory for the duration of an agent request or the human claim.
 *
 * Stored shape: `workspace_profile_drafts.payload = { "$sealed": Envelope }`
 * and `agent_workspace_claims.pending_apps = [{ "$sealed": Box }]`, so the
 * db/0202 functions and constraints stay unchanged.
 */

export const SEAL_MARKER = "$sealed";
const SALT = new TextEncoder().encode("rout-agent-draft-v1");

export type SealPurpose = "key" | "token" | "code";
export type Box = { iv: string; ct: string };
export type Envelope = { v: 1; alg: "A256GCM"; sid: string; iv: string; ct: string; wraps: Record<SealPurpose, Box> };

const te = new TextEncoder();
const td = new TextDecoder();

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const aad = (sid: string, what: string) => te.encode(`rout-agent:${what}:${sid}`);
/** WebCrypto typings want ArrayBuffer-backed views; every view here is one. */
const bs = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

async function kek(secret: string, purpose: SealPurpose, sid: string): Promise<CryptoKey> {
  const raw = te.encode(secret);
  try {
    const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: SALT, info: te.encode(`wrap:${purpose}:${sid}`) },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    raw.fill(0);
  }
}

const dkKey = (dk: Uint8Array) => crypto.subtle.importKey("raw", bs(dk), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

async function encrypt(key: CryptoKey, plain: Uint8Array, ad: Uint8Array): Promise<Box> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: bs(ad) }, key, bs(plain)));
  return { iv: b64u(iv), ct: b64u(ct) };
}
async function decrypt(key: CryptoKey, box: Box, ad: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64u(box.iv)), additionalData: bs(ad) }, key, bs(unb64u(box.ct))));
}

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<Envelope>;
  return e.v === 1 && e.alg === "A256GCM" && typeof e.sid === "string" && typeof e.iv === "string" && typeof e.ct === "string"
    && !!e.wraps && typeof e.wraps === "object" && ["key", "token", "code"].every((p) => typeof (e.wraps as Record<string, Box>)[p]?.ct === "string");
}

/** The sealed envelope inside a stored draft payload, or null for a plaintext (legacy) draft. */
export function sealedEnvelope(payload: unknown): Envelope | null {
  const inner = payload && typeof payload === "object" ? (payload as Record<string, unknown>)[SEAL_MARKER] : null;
  return isEnvelope(inner) ? inner : null;
}

/** Seals a fresh draft: new data key, wrapped once per secret. The data key is wiped afterwards. */
export async function createEnvelope(draft: unknown, secrets: Record<SealPurpose, string>, sid: string): Promise<Envelope> {
  const dk = crypto.getRandomValues(new Uint8Array(32));
  try {
    const wraps = {} as Record<SealPurpose, Box>;
    for (const p of ["key", "token", "code"] as const) wraps[p] = await encrypt(await kek(secrets[p], p, sid), dk, aad(sid, `dk:${p}`));
    const body = await encrypt(await dkKey(dk), te.encode(JSON.stringify(draft)), aad(sid, "draft"));
    return { v: 1, alg: "A256GCM", sid, ...body, wraps };
  } finally {
    dk.fill(0);
  }
}

/** Unwraps the data key with one secret. Throws `seal_secret_mismatch` for a wrong secret. */
export async function unwrapDataKey(env: Envelope, purpose: SealPurpose, secret: string): Promise<Uint8Array> {
  try {
    return await decrypt(await kek(secret, purpose, env.sid), env.wraps[purpose], aad(env.sid, `dk:${purpose}`));
  } catch {
    throw new Error("seal_secret_mismatch");
  }
}

export async function openDraft(env: Envelope, dk: Uint8Array): Promise<Record<string, unknown>> {
  const plain = await decrypt(await dkKey(dk), env, aad(env.sid, "draft"));
  try {
    const parsed = JSON.parse(td.decode(plain)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } finally {
    plain.fill(0);
  }
}

/** Same data key and wraps, new nonce and ciphertext. */
export async function resealDraft(env: Envelope, dk: Uint8Array, draft: unknown): Promise<Envelope> {
  const body = await encrypt(await dkKey(dk), te.encode(JSON.stringify(draft)), aad(env.sid, "draft"));
  return { ...env, ...body };
}

export async function sealApps(apps: unknown[], dk: Uint8Array, sid: string): Promise<[{ [SEAL_MARKER]: Box }]> {
  return [{ [SEAL_MARKER]: await encrypt(await dkKey(dk), te.encode(JSON.stringify(apps)), aad(sid, "apps")) }];
}

/** Opens sealed app specs; a plaintext (legacy) array passes through unchanged. */
export async function openApps(stored: unknown, dk: Uint8Array | null, sid: string | null): Promise<unknown[]> {
  if (!Array.isArray(stored)) return [];
  const box = stored.length === 1 ? (stored[0] as Record<string, unknown> | null)?.[SEAL_MARKER] as Box | undefined : undefined;
  if (!box || typeof box.ct !== "string") return stored;
  if (!dk || !sid) return [];
  const plain = await decrypt(await dkKey(dk), box, aad(sid, "apps"));
  try {
    const parsed = JSON.parse(td.decode(plain)) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } finally {
    plain.fill(0);
  }
}

/** Same merge the db/0202 patch function applies: shallow fields, displayPrefs merged, identity fields locked. */
export function mergeDraftPatch(draft: Record<string, unknown>, fields: Record<string, unknown>, prefs: Record<string, unknown>): Record<string, unknown> {
  const { displayPrefs: _d, username: _u, avatarUrl: _a, faviconUrl: _f, ...rest } = fields;
  const current = draft["displayPrefs"] && typeof draft["displayPrefs"] === "object" && !Array.isArray(draft["displayPrefs"]) ? (draft["displayPrefs"] as Record<string, unknown>) : {};
  return { ...draft, ...rest, displayPrefs: { ...current, ...prefs } };
}
