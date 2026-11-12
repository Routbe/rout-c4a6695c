import { sql } from "@/lib/neon";
import { parseTourDraft, type TourDraft } from "@/lib/tour-draft";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function upsertTourDraft(email: string, draft: TourDraft) {
  const address = normalizeEmail(email);
  if (!address.includes("@")) return { ok: false as const, reason: "invalid_email" };
  await sql`
    insert into public.onboarding_drafts (email, draft, updated_at)
    values (${address}, ${JSON.stringify(draft)}::jsonb, now())
    on conflict (email) do update set draft = excluded.draft, updated_at = now()
  `;
  return { ok: true as const };
}

export async function readTourDraft(email: string): Promise<TourDraft | null> {
  const address = normalizeEmail(email);
  if (!address) return null;
  const rows = (await sql`
    select draft from public.onboarding_drafts where email = ${address} limit 1
  `) as { draft: unknown }[];
  const row = rows[0];
  return row ? parseTourDraft(row.draft) : null;
}

export async function deleteTourDraft(email: string) {
  await sql`delete from public.onboarding_drafts where email = ${normalizeEmail(email)}`;
}

/**
 * Anonieme concepten (nog geen e-mailadres): de rondleiding bewaart ze op een
 * willekeurig token. De sleutelkolom blijft `email`, met het voorvoegsel
 * `token:` zodat er geen extra migratie nodig is.
 */
const tokenKey = (token: string) => `token:${token.trim().slice(0, 80)}`;

export async function upsertTourDraftByToken(token: string, draft: TourDraft) {
  const key = tokenKey(token);
  if (key.length < 12) return { ok: false as const, reason: "invalid_token" };
  await sql`
    insert into public.onboarding_drafts (email, draft, updated_at)
    values (${key}, ${JSON.stringify(draft)}::jsonb, now())
    on conflict (email) do update set draft = excluded.draft, updated_at = now()
  `;
  return { ok: true as const };
}

export async function readTourDraftByToken(token: string): Promise<TourDraft | null> {
  const rows = (await sql`
    select draft from public.onboarding_drafts where email = ${tokenKey(token)} limit 1
  `) as { draft: unknown }[];
  const row = rows[0];
  return row ? parseTourDraft(row.draft) : null;
}

export async function deleteTourDraftByToken(token: string) {
  await sql`delete from public.onboarding_drafts where email = ${tokenKey(token)}`;
}
