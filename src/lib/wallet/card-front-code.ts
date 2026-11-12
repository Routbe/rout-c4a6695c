/**
 * Front QR of the ROUT Card: rout.be/<handle>/<6 digits>. The six digits are
 * HMAC(card key, serial, 10-minute window), so a photographed or leaked card
 * stops being "fresh" within ten minutes. Anyone scanning still lands on the
 * public profile; partners (pool, transit) can ask whether the code is fresh.
 * Six digits (not four): with two valid windows a guess succeeds 1 in 500 000,
 * and /api/public/card-check also limits checks per IP and per card.
 * Pure WebCrypto: works in the browser, Node and Workers.
 */
export const FRONT_WINDOW_S = 600;
export const FRONT_DIGITS = 6;
export const FRONT_CODE = /^\d{6}$/;
/** Codes printed before the six-digit switch: still open the profile, never "fresh". */
export const LEGACY_FRONT_CODE = /^\d{4}$/;

export function frontWindow(nowMs: number): number {
  return Math.floor(nowMs / 1000 / FRONT_WINDOW_S);
}

export async function frontCode(key: Uint8Array, serial: string, window: number): Promise<string> {
  if (key.byteLength < 32) throw new Error("front code key too short");
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`rout-card-front:v1|${serial}|${window}`)));
  const n = ((mac[0]! << 24) | (mac[1]! << 16) | (mac[2]! << 8) | mac[3]!) >>> 0;
  return String(n % 1_000_000).padStart(FRONT_DIGITS, "0");
}

/** Fresh = the current or the previous 10-minute window (covers a scan at the turn of the window). */
export async function isFreshFrontCode(key: Uint8Array, serial: string, code: string, nowMs: number): Promise<boolean> {
  if (!FRONT_CODE.test(code)) return false;
  const w = frontWindow(nowMs);
  const [now, prev] = await Promise.all([frontCode(key, serial, w), frontCode(key, serial, w - 1)]);
  let hit = 0;
  for (const c of [now, prev]) {
    let diff = 0;
    for (let i = 0; i < FRONT_DIGITS; i++) diff |= c.charCodeAt(i) ^ code.charCodeAt(i);
    hit |= diff === 0 ? 1 : 0;
  }
  return hit === 1;
}

/** The URL printed in the big front QR. */
export function frontCardUrl(origin: string, handle: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/${encodeURIComponent(handle.replace(/^@/, "").toLowerCase())}/${code}`;
}
