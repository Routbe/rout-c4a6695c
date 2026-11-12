import { sql } from "@/lib/neon";
import { brandKey, isReservedName } from "./reserved-brands";

type Row = Record<string, unknown>;

/** True when an admin released this reserved term for exactly this user (db/0116). */
export async function hasBrandRelease(userId: string, name: string): Promise<boolean> {
  const term = brandKey(name);
  if (!term) return false;
  const rows = (await sql`select 1 from public.reserved_brand_releases where term = ${term} and user_id = ${userId} limit 1`) as Row[];
  return rows.length > 0;
}

/** Reserved names are usable only by a user holding an admin release for that term. */
export async function reservedNameAllowedFor(userId: string, name: string): Promise<boolean> {
  return !isReservedName(name).reserved || (await hasBrandRelease(userId, name));
}

export async function listBrandReleases(limit = 100) {
  const rows = (await sql`select r.term, r.user_id, r.evidence, r.created_at, u.email, p.username
      from public.reserved_brand_releases r
      left join public.users u on u.id = r.user_id
      left join public.profiles p on p.id = r.user_id
      order by r.created_at desc limit ${limit}`) as Row[];
  return rows.map((r) => ({
    term: String(r["term"]),
    userId: String(r["user_id"]),
    email: (r["email"] as string | null) ?? null,
    username: (r["username"] as string | null) ?? null,
    evidence: String(r["evidence"]),
    createdAt: new Date(String(r["created_at"])).toISOString(),
  }));
}

/** Admin-only (caller checks assertAdminRole): releases a reserved term to one member after verification. */
export async function releaseBrand(adminId: string, input: { term: string; member: string; evidence: string }) {
  const term = brandKey(input.term);
  const known = (await sql`select 1 from public.reserved_brands where term = ${term}`) as Row[];
  if (!known.length) throw new Error("Deze naam staat niet op de lijst met beschermde namen.");
  const member = input.member.trim().replace(/^@/, "").toLowerCase();
  const users = (await sql`select u.id from public.users u left join public.profiles p on p.id = u.id
      where lower(u.email) = ${member} or lower(p.username) = ${member} limit 2`) as Row[];
  if (users.length !== 1) throw new Error("Lid niet (eenduidig) gevonden. Gebruik het e-mailadres.");
  await sql`insert into public.reserved_brand_releases (term, user_id, released_by, evidence)
    values (${term}, ${String(users[0]!["id"])}, ${adminId}, ${input.evidence.trim()})
    on conflict (term, user_id) do nothing`;
  return { ok: true as const };
}
