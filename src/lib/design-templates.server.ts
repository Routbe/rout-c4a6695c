import { sql } from "@/lib/neon";

/**
 * Saved card designs ("Ontwerp 1, 2, 3…"). A template is a snapshot of the
 * profile's look; applying one first saves the current look so nothing is lost.
 */
export const DESIGN_FIELDS = ["theme", "card_style", "blocks", "display_prefs", "url_style", "bio", "tagline", "avatar_url"] as const;
const COLS = DESIGN_FIELDS.join(", ");
const MAX_TEMPLATES = 30;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type DesignTemplate = { id: string; name: string; createdAt: string; preview: { theme: JsonValue; cardStyle: JsonValue } };
type Row = Record<string, unknown>;

export async function snapshotDesign(userId: string): Promise<Record<string, unknown> | null> {
  const rows = (await sql.query(`select ${COLS} from public.profiles where id = $1 limit 1`, [userId])) as Row[];
  return rows[0] ?? null;
}

export async function writeDesign(userId: string, payload: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const k of DESIGN_FIELDS) if (k in payload) clean[k] = payload[k];
  const keys = Object.keys(clean);
  if (!keys.length) return;
  await sql.query(
    `update public.profiles p set (${keys.join(", ")}, updated_at) =
       (select ${keys.map((k) => `r.${k}`).join(", ")}, now() from jsonb_populate_record(null::public.profiles, $1::jsonb) r)
     where p.id = $2`,
    [JSON.stringify(clean), userId],
  );
  // Studio reloads from the published profile instead of an older draft.
  await sql`delete from public.profile_drafts where user_id = ${userId} and space = 'verified'`;
}

export async function listTemplates(userId: string): Promise<DesignTemplate[]> {
  const rows = (await sql`select id, name, created_at, payload->'theme' as theme, payload->'card_style' as card_style
    from public.profile_design_templates where user_id = ${userId} order by created_at asc`) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    createdAt: new Date(String(r["created_at"])).toISOString(),
    preview: { theme: (r["theme"] ?? null) as JsonValue, cardStyle: (r["card_style"] ?? null) as JsonValue },
  }));
}

async function nextName(userId: string): Promise<string> {
  const rows = (await sql`select count(*)::int as n from public.profile_design_templates where user_id = ${userId}`) as Row[];
  return `Ontwerp ${Number(rows[0]?.["n"] ?? 0) + 1}`;
}

export async function saveTemplate(userId: string, name: string | null, payload?: Record<string, unknown> | null) {
  const data = payload ?? (await snapshotDesign(userId));
  if (!data) return null;
  const count = (await sql`select count(*)::int as n from public.profile_design_templates where user_id = ${userId}`) as Row[];
  if (Number(count[0]?.["n"] ?? 0) >= MAX_TEMPLATES) return null;
  // Same look already saved → no duplicate.
  const dup = (await sql`select id from public.profile_design_templates
    where user_id = ${userId} and payload = ${JSON.stringify(data)}::jsonb limit 1`) as Row[];
  if (dup[0]) return String(dup[0]["id"]);
  const rows = (await sql`insert into public.profile_design_templates (user_id, name, payload)
    values (${userId}, ${(name?.trim() || (await nextName(userId))).slice(0, 60)}, ${JSON.stringify(data)}::jsonb)
    returning id`) as Row[];
  return rows[0] ? String(rows[0]["id"]) : null;
}

export async function applyTemplate(userId: string, templateId: string): Promise<boolean> {
  const rows = (await sql`select payload from public.profile_design_templates
    where id = ${templateId} and user_id = ${userId} limit 1`) as Row[];
  const payload = rows[0]?.["payload"] as Record<string, unknown> | undefined;
  if (!payload) return false;
  await saveTemplate(userId, null); // keep the current look
  await writeDesign(userId, payload);
  return true;
}

export async function renameTemplate(userId: string, id: string, name: string) {
  await sql`update public.profile_design_templates set name = ${name.trim().slice(0, 60)}, updated_at = now()
    where id = ${id} and user_id = ${userId}`;
}

export async function deleteTemplate(userId: string, id: string) {
  await sql`delete from public.profile_design_templates where id = ${id} and user_id = ${userId}`;
}

/** Statements for writeDesign, for use inside a larger transaction (account merge). */
export function designWriteStatements(userId: string, payload: Record<string, unknown>): { query: string; params: unknown[] }[] {
  const clean: Record<string, unknown> = {};
  for (const k of DESIGN_FIELDS) if (k in payload) clean[k] = payload[k];
  const keys = Object.keys(clean);
  if (!keys.length) return [];
  return [
    {
      query: `update public.profiles p set (${keys.join(", ")}, updated_at) =
         (select ${keys.map((k) => `r.${k}`).join(", ")}, now() from jsonb_populate_record(null::public.profiles, $1::jsonb) r)
       where p.id = $2`,
      params: [JSON.stringify(clean), userId],
    },
    { query: `delete from public.profile_drafts where user_id = $1 and space = 'verified'`, params: [userId] },
  ];
}

/** saveTemplate as one statement: respects the cap and skips an identical saved look. */
export function templateInsertStatement(userId: string, name: string, payload: Record<string, unknown>) {
  return {
    query: `insert into public.profile_design_templates (user_id, name, payload)
      select $1, $2, $3::jsonb
      where (select count(*) from public.profile_design_templates where user_id = $1) < ${MAX_TEMPLATES}
        and not exists (select 1 from public.profile_design_templates where user_id = $1 and payload = $3::jsonb)`,
    params: [userId, name.slice(0, 60), JSON.stringify(payload)],
  };
}
