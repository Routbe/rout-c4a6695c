export type AppCredential = { id: string; clientId: string; type: "badge" | "certificate" | "diploma"; title: string; description: string | null; imageUrl: string | null; issuedAt: string; showOnName: boolean; appName: string; issuerHandle: string | null };
export type CredentialVisibility = { acceptedAt: string | null; revokedAt: string | null; appPublic: boolean; profilePublic: boolean; consentActive: boolean };
export function appCredentialVisible(value: CredentialVisibility) { return Boolean(value.acceptedAt && !value.revokedAt && value.appPublic && value.profilePublic && value.consentActive); }
export function groupAppCredentials(items: AppCredential[]) {
  const groups = new Map<string, { name: string; credentials: AppCredential[] }>();
  for (const item of items) { const group = groups.get(item.clientId) ?? { name: item.appName, credentials: [] }; group.credentials.push(item); groups.set(item.clientId, group); }
  return [...groups].map(([clientId, group]) => ({ clientId, ...group }));
}