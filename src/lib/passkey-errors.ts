/** Friendly text for WebAuthn / Better Auth passkey failures. */
export function passkeyErrorMessage(code?: string | null, status?: number | null, raw?: string | null): string {
  switch (code) {
    case "ERROR_CEREMONY_ABORTED":
    case "NotAllowedError":
    case "AbortError":
    case "AUTH_CANCELLED":
      return "Registration was cancelled or timed out. Try again and confirm on your device.";
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
    case "InvalidStateError":
      return "This device already has a passkey for your account.";
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
    case "SecurityError":
      return "Passkeys only work on rout.be itself. Open the site directly (not inside a preview frame) and try again.";
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
      return "Your browser blocked the passkey prompt. Open rout.be in a normal tab and try again.";
  }
  if (status === 401) return "Your session expired. Sign in again, then add the passkey.";
  if (status && status >= 500) return "The server could not save this passkey right now. Please try again later.";
  return raw || "This passkey could not be registered.";
}
