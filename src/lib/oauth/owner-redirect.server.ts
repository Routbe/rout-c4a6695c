import { sql } from "@/lib/neon";
import { normalizeRedirectUri, redirectUrisMatch } from "./redirect-match";

export async function getOwnedRedirectMismatch(userId: string, clientId: string, received: string) {
  const rows = await sql`select redirect_uris from public.oauth_clients
    where client_id = ${clientId} and owner_user_id = ${userId} and status = 'active'`;
  const expected = rows[0]?.redirect_uris as string[] | undefined;
  if (!expected || expected.some((uri) => redirectUrisMatch(uri, received))) return null;
  return { code: "redirect_uri_mismatch", expected, received };
}

export async function addOwnedRedirect(userId: string, clientId: string, received: string) {
  const uri = normalizeRedirectUri(received);
  if (!uri) throw new Error("invalid_redirect_uri");
  // Atomic append avoids overwriting concurrent console edits. Ownership is checked
  // in the write itself, not merely by the preceding error-page read.
  const rows = await sql`update public.oauth_clients set
    redirect_uris = array(select distinct unnest(array_append(redirect_uris, ${uri}))),
    updated_at = now()
    where client_id = ${clientId} and owner_user_id = ${userId} and status = 'active'
    returning client_id`;
  if (!rows.length) throw new Error("Forbidden");
}
