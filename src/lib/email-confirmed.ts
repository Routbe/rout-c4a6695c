/**
 * A payment may only be opened by a member whose e-mail is confirmed —
 * verification is identity-bound, and an unconfirmed address makes the receipt
 * and the @rout.be alias unreachable. Card and bank transfer share this check.
 */
export function emailConfirmed(claims: unknown): boolean {
  const c = claims as { email_verified?: boolean; email_confirmed_at?: string } | null;
  return Boolean(c?.email_verified) || Boolean(c?.email_confirmed_at);
}
