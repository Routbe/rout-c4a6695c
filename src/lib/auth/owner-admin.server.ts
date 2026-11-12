import { sql } from "@/lib/neon";

/**
 * Bootstrap van de beheerdersrol.
 *
 * De "setupmodus"-banner verschijnt zolang er geen enkele rij met rol `admin`
 * in `public.user_roles` staat. Deze helpers regelen de veilige toekenning:
 *
 *  1. de eigenaarsadressen (standaard `hallo@rout.be`, te overschrijven met
 *     `OWNER_EMAILS`) krijgen altijd de rol `admin`;
 *  2. het oudste account krijgt de rol uitsluitend na invoer van de eenmalige
 *     ADMIN_BOOTSTRAP_TOKEN via de beveiligde bootstrapactie.
 *
 * De automatische eigenaarstoekenning is idempotent; de tokenclaim is eenmalig.
 */

function ownerEmails(): string[] {
  const raw = process.env["OWNER_EMAILS"] ?? process.env["ADMIN_EMAIL"] ?? "hallo@rout.be";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@"));
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}

export type AdminEmailEligibility = { ok: true } | { ok: false; reason: "missing_email" | "not_admin" | "db_unreachable" };

/** Eligibility with a reason; never grants privileges. */
export async function adminEmailEligibility(email: unknown): Promise<AdminEmailEligibility> {
  if (typeof email !== "string" || !email.trim()) return { ok: false, reason: "missing_email" };
  const normalized = email.trim().toLowerCase();
  if (isOwnerEmail(normalized)) return { ok: true };
  try {
    const rows = (await sql`
      select 1 from public.user_roles r
      join public.users u on u.id = r.user_id
      where lower(u.email) = ${normalized} and r.role::text = 'admin'
      union all
      select 1 from public.admin_permissions p
      join public.users u on u.id = p.user_id
      where lower(u.email) = ${normalized}
      limit 1
    `) as unknown[];
    return rows.length > 0 ? { ok: true } : { ok: false, reason: "not_admin" };
  } catch (err) {
    console.error("[admin-auth] canUseAdminEmail lookup error:", err);
    return { ok: false, reason: "db_unreachable" };
  }
}

/** Eligibility only; never grants privileges. */
export async function canUseAdminEmail(email: unknown): Promise<boolean> {
  return (await adminEmailEligibility(email)).ok;
}

/** Configured owner addresses (for the diagnostic test mail only). */
export function configuredOwnerEmails(): string[] {
  return ownerEmails();
}

async function grantAdmin(userId: string): Promise<void> {
  await sql`
    insert into public.user_roles (user_id, role)
    values (${userId}, 'admin')
    on conflict (user_id, role) do nothing
  `;
}

async function hasAnyAdmin(): Promise<boolean> {
  const rows = (await sql`
    select 1 from public.user_roles where role::text = 'admin' limit 1
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Geeft dit account de beheerdersrol wanneer het een eigenaarsadres is.
 * Faalt nooit hard: authenticatie mag hier niet op stuklopen.
 */
export async function ensureOwnerAdmin(
  userId: string,
  email: string | null | undefined,
): Promise<void> {
  try {
    if (isOwnerEmail(email)) {
      await grantAdmin(userId);
      return;
    }
    // No automatic fallback: an arbitrary oldest account must never silently
    // become administrator.
  } catch (error) {
    console.warn("[owner-admin] could not ensure admin role", error);
  }
}

/**
 * Geeft terug of er al minstens één beheerder bestaat.
 */
export async function hasBootstrapAdmin(): Promise<boolean> {
  try {
    return await hasAnyAdmin();
  } catch (error) {
    console.warn("[owner-admin] bootstrap state failed", error);
    return false;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** One-use promotion for the oldest account, invoked only from an authenticated action. */
export async function claimBootstrapAdmin(userId: string, token: string): Promise<boolean> {
  const configured = process.env["ADMIN_BOOTSTRAP_TOKEN"]?.trim();
  if (!configured || !constantTimeEqual(configured, token.trim())) return false;
  if (await hasAnyAdmin()) return false;

  const oldest = (await sql`
    select id from public.users order by created_at asc limit 1
  `) as { id: string }[];
  if (oldest[0]?.id !== userId) return false;

  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(configured))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const consumed = (await sql`
    insert into public.admin_bootstrap_tokens (token_hash, consumed_by, consumed_at)
    values (${digest}, ${userId}, now())
    on conflict (token_hash) do nothing
    returning token_hash
  `) as { token_hash: string }[];
  if (!consumed[0]) return false;
  await grantAdmin(userId);
  return true;
}
