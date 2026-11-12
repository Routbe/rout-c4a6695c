/**
 * Neon-backed data layer for /dashboard/profile (ProfileSettings page).
 *
 * All queries are explicitly scoped to the caller's own profile row; the
 * showcase/reserved-handle lookups are public read-only reference data.
 */
import { sql } from "@/lib/neon";
import { isMissingColumnError, withoutColumns } from "@/lib/optional-columns";

type Row = Record<string, unknown>;

export type ProfileSettingsProfile = {
  username: string | null;
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean;
  verifiedLegalName: string | null;
};

export type ShowcaseRow = {
  id: string;
  handle: string;
  display_name: string;
  tagline: string;
  link_count: number;
  verified: boolean;
};

export type ReservedRow = {
  handle: string;
  label: string | null;
  reason: string;
};

const COLUMNS = "username, display_name, tagline, bio, avatar_url, verified, verified_legal_name";

async function loadProfile(userId: string, columns: string): Promise<Row | null> {
  const rows = (await sql`
    select ${sql.unsafe(columns)} from public.profiles where id = ${userId} limit 1
  `) as Row[];
  return rows[0] ?? null;
}

export async function readProfileSettings(userId: string): Promise<{
  profile: ProfileSettingsProfile;
  showcase: ShowcaseRow[];
  reserved: ReservedRow[];
}> {
  let row: Row | null;
  try {
    row = await loadProfile(userId, COLUMNS);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    row = await loadProfile(userId, withoutColumns(COLUMNS));
  }

  const [showcase, reserved] = await Promise.all([
    sql`
      select id, handle, display_name, tagline, link_count, verified
        from public.showcase_profiles
       order by sort_order asc
    ` as unknown as Promise<Row[]>,
    sql`
      select handle, label, reason from public.reserved_handles order by handle asc
    ` as unknown as Promise<Row[]>,
  ]);

  return {
    profile: {
      username: (row?.["username"] as string | null) ?? null,
      displayName: (row?.["display_name"] as string | null) ?? null,
      tagline: (row?.["tagline"] as string | null) ?? null,
      bio: (row?.["bio"] as string | null) ?? null,
      avatarUrl: (row?.["avatar_url"] as string | null) ?? null,
      verified: Boolean(row?.["verified"]),
      verifiedLegalName: (row?.["verified_legal_name"] as string | null) ?? null,
    },
    showcase: showcase as unknown as ShowcaseRow[],
    reserved: reserved as unknown as ReservedRow[],
  };
}

export type ProfileSettingsInput = {
  username: string | null;
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  avatarUrl: string | null;
};

export async function writeProfileSettings(userId: string, input: ProfileSettingsInput) {
  // Dual-tier identiteit: de rootnamespace (rout.be/<handle>) is exclusief voor
  // betaalde/geverifieerde leden. Gratis accounts beheren hun naam uitsluitend
  // via het aliasprofiel op /u/<handle> en kunnen hier nooit een roothandle
  // claimen of wijzigen.
  const current = (await sql`
    select username from public.profiles where id = ${userId} limit 1
  `) as Record<string, unknown>[];
  const currentUsername = (current[0]?.["username"] as string | null) ?? null;
  const requested = input.username ? input.username.toLowerCase() : null;
  const unchanged = requested === (currentUsername?.toLowerCase() ?? null);

  if (!unchanged) {
    const { loadEntitlement } = await import("./entitlement.server");
    const entitlement = await loadEntitlement(userId);
    if (!entitlement.entitled) {
      throw new Error("handle_requires_paid");
    }
    const { isHandleAvailableFor } = await import("./handle-namespace.server");
    if (requested && !(await isHandleAvailableFor(requested, userId))) {
      throw new Error("That handle is already taken.");
    }
    if (requested && requested.includes(".")) {
      const domainRows = (await sql`select 1 from public.custom_domains where lower(domain) = lower(${requested}) and status = 'verified' limit 1`.catch(() => [])) as unknown[];
      if (domainRows.length > 0) {
        throw new Error("Een geverifieerde domeinnaam kan geen persoonlijke gebruikersnaam zijn: je profiel staat al rechtstreeks op dat domein. Workspaces mogen hun domein wel als naam gebruiken.");
      }
    }
  }

  // A verified real name is immutable and always wins over submitted names.
  const { lockedRealName } = await import("./identity/identity.server");
  const locked = await lockedRealName(userId).catch(() => null);
  if (locked) input = { ...input, displayName: locked };

  try {
    await sql`
      update public.profiles
         set username = ${input.username},
             display_name = ${input.displayName},
             tagline = ${input.tagline},
             bio = ${input.bio},
             avatar_url = ${input.avatarUrl},
             updated_at = now()
       where id = ${userId}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(/duplicate|unique/i.test(message) ? "That handle is already taken." : message);
  }
}
