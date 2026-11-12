import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export async function readPreferredLanguage(userId: string): Promise<string | null> {
  const rows = (await sql`
    select preferred_language from public.profiles where id = ${userId} limit 1
  `) as Row[];
  return (rows[0]?.["preferred_language"] as string | null) ?? null;
}

export async function writePreferredLanguage(userId: string, locale: string) {
  await sql`update public.profiles set preferred_language = ${locale}, updated_at = now() where id = ${userId}`;
}
