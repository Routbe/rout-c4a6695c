/** Compatible OIDC policy. Pairwise identifiers are NOT blind credentials. */
export const OIDC_PRIVACY_CAPABILITIES = Object.freeze({ pairwiseSubjects: true, clientScopedNullifiers: true, blindIssuance: false, ipUnlinkability: false });
export function tokenRedemptionAuditPayload(clientId: string, grantType: string) {
  // Deliberately omit IP, session id, subject, nullifier and bearer tokens.
  return { client_id: clientId, grant_type: grantType };
}