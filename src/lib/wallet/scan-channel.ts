/**
 * Dual-layer scan routing. The printed metal-card QR (/v/<cardId>) is a public
 * identity lookup only and never grants access; authorisation is the NFC
 * Secure Element handshake (/api/hardware/verify) or the rotating digital
 * token (/s/<token>). Pure and browser-safe.
 */
export type ScanChannel = "physical-public" | "digital-ephemeral" | "hardware-handshake";

export const CHANNEL_CAN_AUTHENTICATE: Record<ScanChannel, boolean> = {
  "physical-public": false,
  "digital-ephemeral": true,
  "hardware-handshake": true,
};

/** Signed card token: base64url(payload) "." base64url(mac). */
export function isSecureTokenShape(s: string): boolean {
  return s.length >= 40 && s.length <= 600 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{40,}$/.test(s);
}

/** Sealed public card id: base64url, no dot, fixed length range. */
export function isPublicCardIdShape(s: string): boolean {
  return /^[A-Za-z0-9_-]{40,120}$/.test(s);
}

export function classifyScan(pathname: string): ScanChannel | null {
  const p = pathname.replace(/\/+$/, "");
  let m = /^\/v\/([^/]+)$/.exec(p);
  if (m) return isPublicCardIdShape(m[1]!) ? "physical-public" : null;
  m = /^\/(?:s|kaart)\/([^/]+)$/.exec(p);
  if (m) return isSecureTokenShape(m[1]!) ? "digital-ephemeral" : null;
  if (p === "/api/hardware/verify") return "hardware-handshake";
  return null;
}
