/**
 * Safe, client-facing error vocabulary for Fediverse sign-in.
 *
 * The server never sends raw failure text to the browser: it logs the detail
 * and returns one of these stable codes. Nothing here can leak environment
 * variables, keys or backend hostnames.
 */

export const MASTODON_ERROR_CODES = [
  "not_configured",
  "invalid_instance",
  "instance_unreachable",
  "instance_rejected",
  "state_invalid",
  "state_expired",
  "code_rejected",
  "account_unverified",
  "session_failed",
  "unknown",
] as const;

export type MastodonErrorCode = (typeof MASTODON_ERROR_CODES)[number];

const MESSAGES: Record<MastodonErrorCode, string> = {
  not_configured:
    "Aanmelden via de Fediverse is tijdelijk niet beschikbaar. Probeer het later opnieuw.",
  invalid_instance: "Dat lijkt geen Fediverse-domein — probeer mastodon.social of je eigen server.",
  instance_unreachable: "Die server reageerde niet. Controleer het domein en probeer opnieuw.",
  instance_rejected:
    "Die server accepteerde ROUT niet. Mogelijk is het geen Mastodon-compatibele server.",
  state_invalid: "Deze aanmeldlink is niet geldig. Begin opnieuw.",
  state_expired: "Deze aanmeldpoging is verlopen. Begin opnieuw.",
  code_rejected: "Je server keurde de aanmelding af. Probeer opnieuw.",
  account_unverified: "Je account kon niet bevestigd worden op die server.",
  session_failed: "Je sessie kon niet gestart worden. Probeer opnieuw.",
  unknown: "Aanmelden via de Fediverse is mislukt. Probeer opnieuw.",
};

export function isMastodonErrorCode(value: unknown): value is MastodonErrorCode {
  return typeof value === "string" && (MASTODON_ERROR_CODES as readonly string[]).includes(value);
}

/** Public message for a code — the only text the browser ever shows. */
export function mastodonErrorMessage(code: unknown): string {
  return MESSAGES[isMastodonErrorCode(code) ? code : "unknown"];
}

/** Extract the stable code from a thrown value, if it carries one. */
export function mastodonErrorCode(error: unknown): MastodonErrorCode {
  const code = (error as { code?: unknown } | null)?.code;
  return isMastodonErrorCode(code) ? code : "unknown";
}

/**
 * Server-side boundary helper: log the full detail server-side (env/config
 * text may appear here — it never leaves the machine), then throw only the
 * safe public message so nothing sensitive crosses the wire to the browser.
 */
export function throwSafeMastodonError(
  error: unknown,
  event: string,
  fields: Record<string, unknown> = {},
): never {
  const code = mastodonErrorCode(error);
  const line = JSON.stringify({
    scope: "mastodon-auth",
    event,
    code,
    at: new Date().toISOString(),
    detail: error instanceof Error ? error.message : String(error),
    ...fields,
  });
  if (code === "unknown") console.error(line);
  else console.warn(line);
  throw new Error(mastodonErrorMessage(code));
}
