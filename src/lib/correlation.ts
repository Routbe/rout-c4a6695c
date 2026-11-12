/**
 * Correlation ids for sign-in flows.
 *
 * One id is minted in the browser the moment a user starts an attempt (e-mail
 * OTP, Google, GitHub, Fediverse) and travels with every log line on both
 * sides, so a single sign-in can be followed end-to-end in the Vercel runtime
 * logs. The id is random and carries no personal data.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** e.g. `cid_lq8w2f_7bkq3z` — short, unique enough, safe to log. */
export function newCorrelationId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let rand = "";
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `cid_${Date.now().toString(36)}_${rand}`;
}

/** Accepts only the shape we mint ourselves; anything else becomes null. */
export function normalizeCorrelationId(value: unknown): string | null {
  return typeof value === "string" && /^cid_[a-z0-9_]{6,40}$/.test(value) ? value : null;
}

/** Structured single-line client log, mirroring the server format. */
export function authClientLog(
  event: string,
  cid: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      scope: "auth-client",
      level: "info",
      event,
      cid,
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}

/** Same, for failures — keeps errors greppable by cid. */
export function authClientError(
  event: string,
  cid: string,
  fields: Record<string, unknown> = {},
): void {
  console.error(
    JSON.stringify({
      scope: "auth-client",
      level: "error",
      event,
      cid,
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}
