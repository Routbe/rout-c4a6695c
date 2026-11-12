/**
 * ROUT Card liveness ("proof of now"). Pure WebCrypto, no I/O.
 *
 * Every 30 s window the card owner gets a short code: HMAC(K_live, serial|window).
 * A screenshot or screen recording shows a code that expires within one
 * window, and the code cannot be computed without the server key. The same
 * key also yields a public per-window noise seed for the shader, so the
 * moving security noise is tied to the real clock.
 */
export const LIVE_WINDOW_S = 30;
/** Accept the previous/next window for clock skew and reading time. */
export const LIVE_SKEW_WINDOWS = 1;
export const LIVE_CODE_LEN = 6;
/** Crockford base32: no I, L, O, U, so a code is easy to read aloud. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SERIAL = /^[\w.-]{8,128}$/;

export function liveWindow(nowMs: number): number {
  return Math.floor(nowMs / 1000 / LIVE_WINDOW_S);
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  if (key.byteLength < 32) throw new Error("liveness key too short");
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}

function assertSerial(serial: string) {
  if (!SERIAL.test(serial)) throw new Error("invalid card serial");
}

export async function liveCode(key: Uint8Array, serial: string, window: number): Promise<string> {
  assertSerial(serial);
  if (!Number.isSafeInteger(window) || window < 0) throw new Error("invalid window");
  const mac = await hmac(key, `rout-card-live:v1|code|${serial}|${window}`);
  let out = "";
  for (let i = 0; i < LIVE_CODE_LEN; i++) out += ALPHABET[mac[i]! & 31];
  return out;
}

/** Public shader seed for a window: unrelated to the code (separate label). */
export async function liveSeed(key: Uint8Array, serial: string, window: number): Promise<[number, number, number, number]> {
  assertSerial(serial);
  const mac = await hmac(key, `rout-card-live:v1|seed|${serial}|${window}`);
  const v = new DataView(mac.buffer);
  return [0, 4, 8, 12].map((o) => v.getUint32(o) / 0xffffffff) as [number, number, number, number];
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Constant-time check against the current window and its neighbours. */
export async function verifyLiveCode(key: Uint8Array, serial: string, input: string, nowMs: number): Promise<boolean> {
  const code = normalizeCode(input);
  if (code.length !== LIVE_CODE_LEN || [...code].some((c) => !ALPHABET.includes(c))) return false;
  const w = liveWindow(nowMs);
  let ok = false;
  for (let d = -LIVE_SKEW_WINDOWS; d <= LIVE_SKEW_WINDOWS; d++) {
    // No early exit: every window is computed and compared.
    ok = safeEqual(await liveCode(key, serial, w + d), code) || ok;
  }
  return ok;
}

/**
 * Privacy filter for the card view. Only these fields may reach the 3D card;
 * anything else on the input (email, phone, birth date, account id) is dropped.
 */
export const CARD_VIEW_FIELDS = [
  "serial", "handle", "space", "displayName", "subheader", "url", "qrValue",
  "hexBackgroundColor", "hexForegroundColor", "sovereignId", "regionDisplay", "avatarPath", "materialId",
] as const;
export type CardViewField = (typeof CARD_VIEW_FIELDS)[number];

export function pickCardView<T extends Record<string, unknown>>(input: T): Pick<T, Extract<keyof T, CardViewField>> {
  const out: Record<string, unknown> = {};
  for (const f of CARD_VIEW_FIELDS) if (f in input) out[f] = input[f];
  return out as Pick<T, Extract<keyof T, CardViewField>>;
}
