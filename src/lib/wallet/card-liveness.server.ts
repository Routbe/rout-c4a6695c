/**
 * Server key for ROUT Card liveness codes, from a dedicated signing secret.
 */
let cached: Promise<Uint8Array> | null = null;

export function livenessKey(): Promise<Uint8Array> {
  if (cached) return cached;
  const secret = process.env["CARD_LIVENESS_SECRET"];
  if (!secret || secret.length < 32) throw new Error("card liveness key not configured");
  cached = (async () => {
    const enc = new TextEncoder();
    const ikm = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("rout-card-live"), info: enc.encode("v1|card-liveness") },
      ikm,
      256,
    );
    return new Uint8Array(bits);
  })();
  cached.catch(() => { cached = null; });
  return cached;
}
