/**
 * Shared secure-QR verification for the /kaart page and /api/card/verify.
 * Order: signature + 60 s TTL → card exists → same card number (tag) → freeze
 * kill-switch → single-use nonce. A success reveals only status, display name and avatar,
 * and the /kaart page asks the scanner for a fresh second factor before calling this.
 */
/** One-way tag of a card serial inside the secure QR (keyed, so serials stay unguessable). */
export async function cardTokenTag(serial: string): Promise<string> {
  const { livenessKey } = await import("./card-liveness.server");
  const k = await crypto.subtle.importKey("raw", (await livenessKey()) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`rout-card-qr:tag|${serial}`)));
  return Array.from(mac.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameTag(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type SecureVerdict =
  | { status: "valid"; display_name: string; avatar_url: string | null; replay_protected: boolean }
  | { status: "invalid" | "expired" | "replayed" | "frozen" };

export function verdictHttpStatus(v: SecureVerdict): number {
  return v.status === "valid" ? 200 : v.status === "frozen" || v.status === "replayed" ? 403 : 401;
}

export async function verifySecureCardTokenCore(token: string): Promise<SecureVerdict> {
  const { livenessKey } = await import("./card-liveness.server");
  const { verifySecureToken } = await import("./card-token");
  const r = await verifySecureToken(await livenessKey(), token, Date.now());
  if (!r.ok) return { status: r.reason };
  const { generateWalletPayload } = await import("./wallet-payload.server");
  const card = await generateWalletPayload(r.payload.h, { space: r.payload.s === "a" ? "alias" : "root" });
  if (!card) return { status: "invalid" };
  // A token of a replaced card never counts for the new card number.
  if (!sameTag(r.payload.c, await cardTokenTag(card.serial))) return { status: "invalid" };
  const { validateCardActive, useTokenNonce } = await import("./card-freeze.server");
  if (!(await validateCardActive(card.serial))) return { status: "frozen" };
  try {
    const first = await useTokenNonce(r.payload.n, r.payload.exp);
    if (first !== true) return { status: first === false ? "replayed" : "invalid" };
  } catch { return { status: "invalid" }; }
  return { status: "valid", display_name: card.displayName, avatar_url: card.heroImageUrl, replay_protected: true };
}
