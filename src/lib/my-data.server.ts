/**
 * Neon-backed export/delete for "my data" (used by AccountSettings & MyData
 * pages). Mirrors the old `delete_account()` RPC, scoped to the caller only.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

/**
 * Volledige, portabele export: profiel, links/blokken, sociale verificaties,
 * doorstuurregels (aliassen), eigen domeinen en stijlvoorkeuren. Tabellen die
 * in een oudere database ontbreken worden stil overgeslagen, zodat de export
 * altijd een bestand oplevert.
 */
const safe = async (run: () => Promise<Row[]>): Promise<Row[]> => {
  try {
    return await run();
  } catch {
    return [];
  }
};

export async function exportMyData(userId: string) {
  const [profile, saved, tracked, badges, links, socials, aliases, domains] = await Promise.all([
    safe(
      () =>
        sql`select * from public.profiles where id = ${userId} limit 1` as unknown as Promise<
          Row[]
        >,
    ),
    safe(
      () =>
        sql`select * from public.saved_qrs where user_id = ${userId}` as unknown as Promise<Row[]>,
    ),
    safe(
      () =>
        sql`select * from public.tracked_qrs where user_id = ${userId}` as unknown as Promise<
          Row[]
        >,
    ),
    safe(
      () =>
        sql`select * from public.user_badges where user_id = ${userId}` as unknown as Promise<
          Row[]
        >,
    ),
    safe(
      () => sql`select * from public.links where user_id = ${userId}` as unknown as Promise<Row[]>,
    ),
    safe(
      () =>
        sql`select * from public.social_links where profile_id = ${userId} order by position asc` as unknown as Promise<
          Row[]
        >,
    ),
    safe(
      () =>
        sql`select * from public.email_aliases where user_id = ${userId}` as unknown as Promise<
          Row[]
        >,
    ),
    safe(
      () =>
        sql`select * from public.custom_domains where user_id = ${userId}` as unknown as Promise<
          Row[]
        >,
    ),
  ]);

  const row = profile[0] ?? null;
  return {
    exportedAt: new Date().toISOString(),
    format: "rout.data-export.v2",
    profile: row,
    blocks: (row?.["blocks"] ?? []) as unknown,
    stylePreferences: {
      theme: row?.["theme"] ?? null,
      display_prefs: row?.["display_prefs"] ?? null,
      accent: row?.["accent"] ?? null,
    },
    links,
    socialLinks: socials,
    forwarding: {
      forwarding_email: row?.["forwarding_email"] ?? null,
      aliases,
    },
    customDomains: domains,
    savedQrs: saved,
    trackedQrs: tracked,
    badges,
  };
}

/** Mirrors `public.delete_account()`: wipes owned rows, keeps the auth identity. */
export async function deleteMyAccountData(userId: string) {
  await sql`delete from public.saved_qrs where user_id = ${userId}`;
  await sql`delete from public.tracked_qrs where user_id = ${userId}`;
  await sql`delete from public.api_keys where user_id = ${userId}`;
  await sql`delete from public.custom_domains where user_id = ${userId}`;
  await sql`delete from public.notifications where user_id = ${userId}`;
  await sql`delete from public.user_badges where user_id = ${userId}`;
  await sql`delete from public.profiles where id = ${userId}`;
}
