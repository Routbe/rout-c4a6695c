/**
 * The single source of `sub` for every token, userinfo response and event sent to an app.
 * Subjects are derived with the HKDF engine in `subject-vault.ts` and recorded in
 * public.oidc_subjects (unique per user + sector + version, and per sector + subject).
 * The raw account id is never returned, so it can never reach a JWT.
 */
import { sql, withDbContext } from "@/lib/neon";
import { CURRENT_SUBJECT_VERSION, scopedSubject, sectorFor } from "./subject-vault";

type SubjectClient = { clientId: string; subjectType: "public" | "pairwise"; sectorId: string | null };

function masterKey(): string {
  const k = process.env["ROUT_SUBJECT_MASTER_KEY"] ?? "";
  if (k.length < 32) throw new Error("subject_master_missing");
  return k;
}

export type ScopedSubject = { sub: string; previousSub: string | null };

export async function resolveScopedSubject(client: SubjectClient, userId: string): Promise<ScopedSubject> {
  // Row-level rules only let the runtime role touch this member's own rows.
  return withDbContext({ userId, workspaceId: null }, () => resolveInContext(client, userId));
}

async function resolveInContext(client: SubjectClient, userId: string): Promise<ScopedSubject> {
  const sector = sectorFor(client);
  const version = CURRENT_SUBJECT_VERSION;
  const subject = await scopedSubject(masterKey(), version, sector, userId);
  await sql`insert into public.oidc_subjects (user_id, sector, version, subject)
    values (${userId}, ${sector}, ${version}, ${subject})
    on conflict (user_id, sector, version) do nothing`;
  const rows = (await sql`select version, subject, revoked_at from public.oidc_subjects
    where user_id = ${userId} and sector = ${sector}
    order by version desc limit 2`) as { version: number; subject: string; revoked_at: string | null }[];
  const current = rows.find((r) => Number(r.version) === version);
  // A stored value that differs means the master key changed without a version bump: refuse.
  if (!current || current.subject !== subject) throw new Error("subject_mismatch");
  if (current.revoked_at) throw new Error("subject_revoked");
  const previous = rows.find((r) => Number(r.version) < version && !r.revoked_at);
  return { sub: subject, previousSub: previous?.subject ?? null };
}

/** Subject of a user for an app id (events, webhooks). */
export async function scopedSubjectForClientId(userId: string, clientId: string): Promise<string> {
  const { getClientByClientId } = await import("./provider.server");
  const client = await getClientByClientId(clientId);
  if (!client) throw new Error("unknown_client");
  return (await resolveScopedSubject(client, userId)).sub;
}
