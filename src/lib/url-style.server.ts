import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export async function readUrlStyle(userId: string): Promise<string | null> {
  const rows = (await sql`
    select url_style from public.profiles where id = ${userId} limit 1
  `) as Row[];
  return (rows[0]?.["url_style"] as string | null) ?? null;
}

export async function writeUrlStyle(userId: string, style: string) {
  await sql`update public.profiles set url_style = ${style}, updated_at = now() where id = ${userId}`;
}
