/** Builds the redirect back to a (trusted) app redirect URI, always echoing state. */
export function redirectWith(
  redirectUri: string,
  state: string | null | undefined,
  params: Record<string, string>,
) {
  const target = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  if (state) target.searchParams.set("state", state);
  return target.toString();
}

/** Standard OIDC error redirect (RFC 6749 §4.1.2.1). */
export function errorRedirect(
  redirectUri: string,
  state: string | null | undefined,
  error: string,
  description: string,
) {
  return redirectWith(redirectUri, state, { error, error_description: description });
}
