/**
 * Opaque public references for account ids.
 *
 * Public pages need to point back at a profile owner (badges, timeline) without
 * revealing the internal account id. A reference is AES-256-GCM over the id with
 * a fresh IV each time, so two references to the same account never look alike:
 * a root profile and its alias stay unlinkable, and a leaked reference cannot be
 * turned into an account id without PUBLIC_REF_SECRET. Without the key no
 * reference is issued and none is accepted (fail closed).
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const PREFIX = "pr1.";
const AAD = enc.encode("rout-public-ref:v1");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
};

async function refKey(secret: string, purpose = "aes-gcm:v1"): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("rout-public-ref"), info: enc.encode(purpose) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function secretFromEnv(): string | null {
  const s = process.env["PUBLIC_REF_SECRET"] ?? "";
  return s.length >= 32 ? s : null;
}

export function isPublicRef(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(PREFIX) && v.length <= 200;
}

/** Seals an account id; returns null when the id is invalid or no key is configured. */
export async function sealPublicRef(accountId: string, secret: string | null = secretFromEnv()): Promise<string | null> {
  if (!secret || !UUID.test(accountId)) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, await refKey(secret), enc.encode(accountId.toLowerCase())),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return PREFIX + b64url(out);
}

/** Opens a reference; returns null for anything forged, altered or malformed. */
export async function openPublicRef(ref: string, secret: string | null = secretFromEnv()): Promise<string | null> {
  if (!secret || !isPublicRef(ref)) return null;
  try {
    const raw = unb64url(ref.slice(PREFIX.length));
    if (raw.length < 12 + 16 + 36) return null;
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: AAD },
      await refKey(secret),
      raw.slice(12),
    );
    const id = dec.decode(pt);
    return UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Public profile rows: the internal id is replaced by a sealed reference before leaving the server. */
export async function withPublicRef<T extends Record<string, unknown>>(row: T): Promise<T> {
  const id = row["id"];
  return {
    ...row,
    id: typeof id === "string" ? await sealPublicRef(id) : null,
    // Avatar paths start with the account id; seal them too.
    ...("avatar_url" in row ? { avatar_url: await publicAvatarUrl(row["avatar_url"]) } : {}),
    ...("favicon_url" in row ? { favicon_url: await publicAvatarUrl(row["favicon_url"]) } : {}),
  } as T;
}

/**
 * Resolves the owner a public widget asks about: a sealed reference from a public
 * profile response, or the signed-in member's own id (Studio previews). Any other
 * raw account id is refused, so ids cannot be probed from outside.
 */
export async function resolveOwnerRef(input: string, sessionUserId: string | null): Promise<string | null> {
  if (isPublicRef(input)) return openPublicRef(input);
  if (sessionUserId && UUID.test(input) && input.toLowerCase() === sessionUserId.toLowerCase()) return sessionUserId;
  return null;
}

/**
 * Sealed text for a purpose-bound URL token (fresh IV each call). `aad` binds the
 * token to its context, e.g. the app it was issued to, so it cannot be replayed elsewhere.
 */
export async function sealText(plain: string, aad: string, secret: string | null = secretFromEnv()): Promise<string | null> {
  if (!secret || plain.length > 2000) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await refKey(secret, "text:v1"), enc.encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function openText(token: string, aad: string, secret: string | null = secretFromEnv()): Promise<string | null> {
  if (!secret || !/^[A-Za-z0-9_-]{40,3000}$/.test(token)) return null;
  try {
    const raw = unb64url(token);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: enc.encode(aad) }, await refKey(secret, "text:v1"), raw.slice(12));
    return dec.decode(pt);
  } catch {
    return null;
  }
}

const AVATAR_PATH = /^\/api\/public\/avatar\?path=([0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120})$/;

/** Avatar storage path inside a ROUT avatar URL (it starts with the account id), or null. */
export function avatarPathOf(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = AVATAR_PATH.exec(url.replace(/^https?:\/\/[^/]+/, "").replace("%2F", "/"));
  return m ? m[1]! : null;
}

/** Rewrites a ROUT avatar URL so its account-id path is sealed; other URLs pass through unchanged. */
export async function publicAvatarUrl(url: unknown): Promise<string | null> {
  if (typeof url !== "string" || !url) return null;
  const path = avatarPathOf(url);
  if (!path) return url;
  const token = await sealText(path, "avatar:public");
  return token ? `/api/public/avatar?ref=${token}` : null;
}
