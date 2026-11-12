import JSZip from "jszip";
import { sql } from "@/lib/neon";
import { exportMyData } from "./my-data.server";

/**
 * Sovereign Data Vault: one ZIP of JSON files with everything the member owns.
 * Every query is scoped to the caller; secrets (token hashes, proof digests) are never exported.
 */
type Row = Record<string, unknown>;
const safe = async (run: () => Promise<unknown>): Promise<Row[]> => {
  try {
    return (await run()) as Row[];
  } catch {
    return [];
  }
};

export async function buildVaultZip(userId: string): Promise<Uint8Array> {
  const { authIdOf } = await import("./identity/links.server");
  const authId = await authIdOf(userId);
  const [base, bookings, bookingRequests, media, identities, appSessions, authSessions, consents] = await Promise.all([
    exportMyData(userId),
    safe(() => sql`select * from public.bookings where host_user_id = ${userId} order by start_utc desc`),
    safe(() => sql`select * from public.booking_requests where profile_id = ${userId} order by created_at desc`),
    safe(() => sql`select path, content_type, created_at from public.gallery_objects where user_id = ${userId}`),
    safe(() => sql`select id, provider, issuer, display_handle, proof_method, status, login_enabled, created_at, last_verified_at, revoked_at
      from public.identity_links where user_id = ${authId}`),
    safe(() => sql`select id, user_agent, created_at, last_seen_at, expires_at, revoked_at from public.user_sessions where user_id = ${userId}`),
    safe(() => sql`select id, "userAgent" as user_agent, "createdAt" as created_at, "expiresAt" as expires_at
      from neon_auth.session where "userId"::text = ${authId}`),
    safe(() => sql`select g.client_id, c.name, g.scopes, g.created_at, g.revoked_at
      from public.oauth_consents g left join public.oauth_clients c on c.client_id = g.client_id where g.user_id = ${userId}`),
  ]);
  const zip = new JSZip();
  const put = (name: string, value: unknown) => zip.file(name, JSON.stringify(value, null, 2));
  put("README.json", { format: "rout.vault.v1", exportedAt: new Date().toISOString(), userId });
  put("profile.json", { profile: base.profile, blocks: base.blocks, stylePreferences: base.stylePreferences, badges: base.badges });
  put("links.json", { links: base.links, socialLinks: base.socialLinks, forwarding: base.forwarding, customDomains: base.customDomains, savedQrs: base.savedQrs, trackedQrs: base.trackedQrs });
  put("media.json", media);
  put("bookings.json", { bookings, bookingRequests });
  put("identity_links.json", identities);
  put("sessions.json", { app: appSessions, auth: authSessions });
  put("oauth_consents.json", consents);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
