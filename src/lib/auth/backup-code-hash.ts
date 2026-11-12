/**
 * Recovery (backup) codes are stored only as keyed, slow hashes: PBKDF2-SHA256,
 * 210 000 iterations, salted with a server pepper derived from the auth secret.
 * Deterministic so Better Auth's "is this code in the list" check works on hashes:
 * the gateway hashes the submitted code before Better Auth sees it.
 * (Argon2/bcrypt are too CPU-heavy for the Worker runtime; codes carry ~59 bits of
 * entropy, so a peppered PBKDF2 hash is not brute-forceable from a DB leak.)
 */
const enc = new TextEncoder();
export const HASH_PREFIX = "h1$";
export const PBKDF2_ITERATIONS = 210_000;

export function isHashedCode(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(HASH_PREFIX);
}

export async function hashBackupCode(code: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(code.trim()), "PBKDF2", false, ["deriveBits"]);
  const salt = await crypto.subtle.digest("SHA-256", enc.encode(`rout.backup-code.v1:${pepper}`));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  let s = "";
  for (const b of new Uint8Array(bits)) s += String.fromCharCode(b);
  return HASH_PREFIX + btoa(s).replace(/=+$/, "");
}

/** Better Auth `storeBackupCodes` adapter: never writes a plaintext code. */
export function hashedBackupCodeStore(pepper: string, legacyDecrypt: (data: string) => Promise<string>) {
  const toHashes = (codes: unknown[]) =>
    Promise.all(codes.filter((c): c is string => typeof c === "string").map((c) => (isHashedCode(c) ? c : hashBackupCode(c, pepper))));
  return {
    encrypt: async (json: string) => JSON.stringify(await toHashes(JSON.parse(json) as unknown[])),
    decrypt: async (data: string) => {
      // Older rows hold Better Auth's encrypted plaintext list: read once, return hashes.
      const raw = data.trim().startsWith("[") ? data : await legacyDecrypt(data);
      return JSON.stringify(await toHashes(JSON.parse(raw) as unknown[]));
    },
  };
}
