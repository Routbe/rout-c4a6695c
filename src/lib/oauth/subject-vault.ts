/**
 * Scoped subject derivation for "Login met ROUT" (pure; pass the master key from server code).
 *
 *   K_sector = HKDF-SHA256(ikm = master, salt = "rout-sub", info = "v{n}|" + byteLength(sector) + ":" + sector)
 *   subject  = base64url(HMAC-SHA256(K_sector, "uid:" + userId))   — 43 characters
 *
 * The length prefix makes every (version, sector) pair encode uniquely, the key
 * version allows rotation, and without the master key a subject can neither be
 * computed from nor turned back into an account id.
 */
const enc = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Current key version for new subjects; version 1 was the legacy scheme. */
export const CURRENT_SUBJECT_VERSION = 2;

export function subjectInfo(version: number, sector: string): string {
  if (!Number.isInteger(version) || version < 1 || version > 999) throw new Error("invalid_subject_version");
  if (!sector || sector.length > 300) throw new Error("invalid_sector");
  return `v${version}|${enc.encode(sector).length}:${sector}`;
}

/** Sector a client's subjects live in: its verified redirect host for pairwise apps, else the app itself. */
export function sectorFor(client: { clientId: string; subjectType: "public" | "pairwise"; sectorId: string | null }): string {
  return client.subjectType === "pairwise" && client.sectorId ? `host:${client.sectorId.toLowerCase()}` : `client:${client.clientId}`;
}

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function scopedSubject(master: string, version: number, sector: string, userId: string): Promise<string> {
  if (master.length < 32) throw new Error("subject_master_missing");
  if (!UUID.test(userId)) throw new Error("invalid_user_id");
  const ikm = await crypto.subtle.importKey("raw", enc.encode(master), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("rout-sub"), info: enc.encode(subjectInfo(version, sector)) },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`uid:${userId.toLowerCase()}`));
  return b64url(new Uint8Array(mac));
}
