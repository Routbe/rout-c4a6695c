import { sql } from "@/lib/neon";

/**
 * Eén naamruimte voor alle publieke handles.
 *
 * ROUT kent per account maximaal twee profielen:
 *   • het gratis aliasprofiel   → rout.be/u/<alias_profiles.handle>
 *   • het geverifieerde profiel → rout.be/<profiles.username>
 *
 * Daarnaast kan een geverifieerd profiel een extra root-URL dragen
 * (`profiles.subdomain_alias`). Dat is géén derde profiel maar een tweede
 * adres naar hetzelfde geverifieerde profiel — het moet dus wél meedoen in
 * dezelfde uniciteitscontrole, anders kan één naam naar twee accounts wijzen.
 *
 * Deze helper is de enige plek die bepaalt of een naam vrij is.
 */

type Row = Record<string, unknown>;

export type HandleSlot = "root" | "alias" | "root_domain" | "dns_claim" | "workspace_root";

export type HandleOwner = { userId: string; slot: HandleSlot };

/** Wie bezit deze naam op dit moment? `null` = vrij. */
export async function findHandleOwner(handle: string): Promise<HandleOwner | null> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!h) return null;

  const rootRows = (await sql`
    select id, case when lower(username) = ${h} then 'root' else 'root_domain' end as slot
      from public.profiles
     where lower(username) = ${h}
        or lower(coalesce(subdomain_alias, '')) = ${h}
     order by (lower(username) = ${h}) desc
     limit 1
  `) as Row[];
  const root = rootRows[0];
  if (root) {
    return { userId: root["id"] as string, slot: root["slot"] as HandleSlot };
  }

  let aliasRows: Row[] = [];
  try {
    aliasRows = (await sql`
      select user_id from public.alias_profiles where lower(handle) = ${h} limit 1
    `) as Row[];
  } catch {
    // Alias-tabel bestaat nog niet (migratie 38): dan is er ook geen aliasnaam.
    aliasRows = [];
  }
  const alias = aliasRows[0];
  if (alias) return { userId: alias["user_id"] as string, slot: "alias" };

  // A DNS-verified domain (db/0119) holds its root handle, also during the 30-day grace period.
  const claimRows = (await sql`
    select user_id from public.domain_claims
     where handle = ${h} and status in ('verified', 'grace') limit 1
  `.catch(() => [])) as Row[];
  if (claimRows[0]) return { userId: claimRows[0]["user_id"] as string, slot: "dns_claim" };

  // A workspace root alias (db/0122) shares the namespace; userId carries the workspace id.
  const wsRows = (await sql`
    select workspace_id from public.workspace_root_aliases where handle = ${h} limit 1
  `.catch(() => [])) as Row[];
  if (wsRows[0]) return { userId: wsRows[0]["workspace_id"] as string, slot: "workspace_root" };

  return null;
}

/**
 * Is deze naam vrij voor `userId`? Een gebruiker mag zijn eigen naam altijd
 * herbevestigen, ook wanneer die in een andere slot van hetzelfde account zit.
 */
export async function isHandleAvailableFor(
  handle: string,
  userId: string | null,
): Promise<boolean> {
  const owner = await findHandleOwner(handle);
  if (!owner) return true;
  return Boolean(userId) && owner.userId === userId;
}
