/**
 * Granular admin permissions, manual legal-name management, device/location
 * insight and per-user feature blocks. Server-only.
 */
import { sql } from "@/lib/neon";
import { writeAudit } from "./admin.server";
import { normalizeLegalName } from "./legal-name";
import { verifiedHandleError, verifiedHandleSuggestionList } from "./verified-handle";
import { sendVerificationApproved, sendVerificationRejected } from "@/lib/brevo/client";

type Row = Record<string, unknown>;

/** Every capability that can be delegated without the full admin role. */
export const ADMIN_PERMISSIONS = [
  "verify_users",
  "edit_names",
  "manage_promos",
  "view_device_data",
  "block_features",
  "manage_admins",
  "approve_sepa",
  "grant_badges",
  "manage_integrations",
  "review_apps",
  "export_data",
  "triage_contact",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const FEATURE_BLOCKS = [
  "handle_change",
  "name_change",
  "avatar_change",
  "links_edit",
  "payments",
] as const;

export type BlockableFeature = (typeof FEATURE_BLOCKS)[number];

export function isAdminPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

async function isFullAdmin(userId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from public.user_roles where user_id = ${userId} and role::text = 'admin' limit 1
  `) as Row[];
  return rows.length > 0;
}

/** Full admins implicitly hold every permission. */
export async function hasAdminPermission(
  userId: string,
  permission: AdminPermission,
): Promise<boolean> {
  if (await isFullAdmin(userId)) return true;
  try {
    const rows = (await sql`
      select 1 from public.admin_permissions
       where user_id = ${userId} and permission = ${permission} limit 1
    `) as Row[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function assertAdminPermission(userId: string, permission: AdminPermission) {
  const { isPublicMode } = await import("./app-mode");
  if (isPublicMode()) throw new Error("forbidden");
  if (!(await hasAdminPermission(userId, permission))) {
    throw Object.assign(new Error("forbidden"), { statusCode: 403 });
  }
  // Every admin surface requires 2FA switched on.
  const { memberTwoFactorEnabled } = await import("./auth/second-factor.server");
  const { ADMIN_TWO_FACTOR_REQUIRED } = await import("./auth/sign-in-policy");
  if (!(await memberTwoFactorEnabled(userId))) throw Object.assign(new Error(ADMIN_TWO_FACTOR_REQUIRED), { statusCode: 403 });
}

/** Permissions of the signed-in user, for gating the admin UI. */
export async function myAdminAccess(userId: string) {
  const { memberTwoFactorEnabled } = await import("./auth/second-factor.server");
  const twoFactorEnabled = await memberTwoFactorEnabled(userId).catch(() => false);
  const fullAdmin = await isFullAdmin(userId);
  if (fullAdmin) return { fullAdmin, twoFactorEnabled, permissions: [...ADMIN_PERMISSIONS] as AdminPermission[] };
  try {
    const rows = (await sql`
      select permission from public.admin_permissions where user_id = ${userId}
    `) as Row[];
    return {
      fullAdmin,
      twoFactorEnabled,
      permissions: rows
        .map((r) => String(r["permission"]))
        .filter(isAdminPermission) as AdminPermission[],
    };
  } catch {
    return { fullAdmin, twoFactorEnabled, permissions: [] as AdminPermission[] };
  }
}

export interface AdminGrantRow {
  userId: string;
  email: string | null;
  username: string | null;
  permissions: AdminPermission[];
  fullAdmin: boolean;
}

/** Everyone who holds the admin role and/or one or more delegated permissions. */
export async function listAdminGrants(): Promise<AdminGrantRow[]> {
  const rows = (await sql`
    select u.id,
           u.email,
           p.username,
           coalesce(array_agg(ap.permission) filter (where ap.permission is not null), '{}') as perms,
           exists (select 1 from public.user_roles r
                    where r.user_id = u.id and r.role::text = 'admin') as full_admin
      from public.users u
      left join public.profiles p on p.id = u.id
      left join public.admin_permissions ap on ap.user_id = u.id
     where exists (select 1 from public.admin_permissions x where x.user_id = u.id)
        or exists (select 1 from public.user_roles r where r.user_id = u.id and r.role::text = 'admin')
     group by u.id, u.email, p.username
     order by u.email nulls last
     limit 100
  `) as Row[];

  return rows.map((r) => ({
    userId: String(r["id"]),
    email: (r["email"] as string | null) ?? null,
    username: (r["username"] as string | null) ?? null,
    permissions: ((r["perms"] as string[] | null) ?? []).filter(isAdminPermission),
    fullAdmin: Boolean(r["full_admin"]),
  }));
}

/** Grants or revokes one permission for one user. */
export async function setAdminPermission(opts: {
  adminId: string;
  userId: string;
  permission: AdminPermission;
  granted: boolean;
}) {
  if (opts.granted) {
    await sql`
      insert into public.admin_permissions (user_id, permission, granted_by)
      values (${opts.userId}, ${opts.permission}, ${opts.adminId})
      on conflict (user_id, permission) do nothing
    `;
  } else {
    await sql`
      delete from public.admin_permissions
       where user_id = ${opts.userId} and permission = ${opts.permission}
    `;
  }
  await writeAudit({
    adminId: opts.adminId,
    action: opts.granted ? "admin_permission_grant" : "admin_permission_revoke",
    targetUserId: opts.userId,
    targetLabel: opts.permission,
  });
  return { ok: true as const };
}

/** Sets or corrects the legal first/last name and returns handle suggestions. */
export async function setUserLegalName(opts: {
  adminId: string;
  userId: string;
  firstName: string;
  lastName: string;
  applyHandle?: string | null;
}) {
  const first = normalizeLegalName(opts.firstName);
  const last = normalizeLegalName(opts.lastName);
  if (!first || !last) return { ok: false as const, error: "Voor- en achternaam zijn verplicht." };
  const legalName = `${first} ${last}`;

  await sql`
    insert into public.profiles (id, legal_first_name, legal_last_name, verified_legal_name, updated_at)
    values (${opts.userId}, ${first}, ${last}, ${legalName}, now())
    on conflict (id) do update set
      legal_first_name = excluded.legal_first_name,
      legal_last_name = excluded.legal_last_name,
      verified_legal_name = excluded.verified_legal_name,
      updated_at = now()
  `;

  const suggestions = verifiedHandleSuggestionList(legalName);
  const handle = opts.applyHandle?.trim().replace(/^@/, "").toLowerCase() ?? "";
  let appliedHandle: string | null = null;
  if (handle) {
    const taken = (await sql`
      select id from public.profiles where username = ${handle} and id <> ${opts.userId} limit 1
    `) as Row[];
    if (taken.length)
      return { ok: false as const, error: "Die gebruikersnaam is al bezet.", suggestions };
    // Geverifieerde accounts dragen de naamstructuur; vrije aliassen niet.
    const verifiedRows = (await sql`
      select coalesce(verified, false) as verified from public.profiles where id = ${opts.userId} limit 1
    `) as Row[];
    if (verifiedRows[0]?.["verified"] === true) {
      const issue = verifiedHandleError(handle, legalName);
      if (issue) return { ok: false as const, error: issue, suggestions };
    }
    await sql`update public.profiles set username = ${handle}, updated_at = now() where id = ${opts.userId}`;
    appliedHandle = handle;
  }

  await writeAudit({
    adminId: opts.adminId,
    action: "legal_name_set",
    targetUserId: opts.userId,
    targetLabel: legalName,
    notes: appliedHandle ? `handle=${appliedHandle}` : null,
  });

  return { ok: true as const, legalName, suggestions, appliedHandle };
}

export interface UserInsight {
  userId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  verifiedLegalName: string | null;
  verified: boolean;
  tier: string;
  country: string | null;
  city: string | null;
  locationAt: string | null;
  sessions: { device: string | null; lastSeen: string | null; ipHash: string | null }[];
  socialAccounts: { provider: string; handle: string | null; verified: boolean }[];
  blocks: { feature: string; reason: string | null; until: string | null }[];
}

/** Everything an admin may see about one user: approximate location, devices,
 *  linked social accounts and active feature blocks. */
export async function getUserInsight(userId: string): Promise<UserInsight | null> {
  const rows = (await sql`
    select p.id, u.email, p.username, p.display_name, p.verified, p.tier,
           p.last_country, p.last_city, p.last_location_at,
           p.legal_first_name, p.legal_last_name, p.verified_legal_name
      from public.profiles p
      left join public.users u on u.id = p.id
     where p.id = ${userId}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;

  let sessions: UserInsight["sessions"] = [];
  try {
    const s = (await sql`
      select user_agent, ip_hash, created_at
        from public.sessions
       where user_id = ${userId}
       order by created_at desc
       limit 10
    `) as Row[];
    sessions = s.map((r) => ({
      device: (r["user_agent"] as string | null) ?? null,
      lastSeen: (r["created_at"] as string | null) ?? null,
      ipHash: (r["ip_hash"] as string | null) ?? null,
    }));
  } catch {
    sessions = [];
  }

  let socialAccounts: UserInsight["socialAccounts"] = [];
  try {
    const s = (await sql`
      select platform, username, coalesce(is_verified, false) as is_verified
        from public.social_links
       where profile_id = ${userId}
       limit 20
    `) as Row[];
    socialAccounts = s.map((r) => ({
      provider: String(r["platform"]),
      handle: (r["username"] as string | null) ?? null,
      verified: Boolean(r["is_verified"]),
    }));
  } catch {
    socialAccounts = [];
  }

  return {
    userId,
    email: (row["email"] as string | null) ?? null,
    username: (row["username"] as string | null) ?? null,
    displayName: (row["display_name"] as string | null) ?? null,
    legalFirstName: (row["legal_first_name"] as string | null) ?? null,
    legalLastName: (row["legal_last_name"] as string | null) ?? null,
    verifiedLegalName: (row["verified_legal_name"] as string | null) ?? null,
    verified: Boolean(row["verified"]),
    tier: (row["tier"] as string | null) ?? "free",
    country: (row["last_country"] as string | null) ?? null,
    city: (row["last_city"] as string | null) ?? null,
    locationAt: (row["last_location_at"] as string | null) ?? null,
    sessions,
    socialAccounts,
    blocks: await listFeatureBlocks(userId),
  };
}

export async function listFeatureBlocks(userId: string) {
  try {
    const rows = (await sql`
      select feature, reason, until from public.user_feature_blocks
       where user_id = ${userId} and (until is null or until > now())
    `) as Row[];
    return rows.map((r) => ({
      feature: String(r["feature"]),
      reason: (r["reason"] as string | null) ?? null,
      until: (r["until"] as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** True when the user is currently blocked from a capability. Never throws so
 *  a missing migration cannot lock everybody out. */
export async function isFeatureBlocked(
  userId: string,
  feature: BlockableFeature,
): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1 from public.user_feature_blocks
       where user_id = ${userId} and feature = ${feature}
         and (until is null or until > now())
       limit 1
    `) as Row[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function setFeatureBlock(opts: {
  adminId: string;
  userId: string;
  feature: BlockableFeature;
  blocked: boolean;
  reason?: string | null;
  /** ISO timestamp; omit for a permanent block. */
  until?: string | null;
}) {
  if (opts.blocked) {
    await sql`
      insert into public.user_feature_blocks (user_id, feature, reason, until, created_by)
      values (${opts.userId}, ${opts.feature}, ${opts.reason ?? null}, ${opts.until ?? null}, ${opts.adminId})
      on conflict (user_id, feature) do update set
        reason = excluded.reason,
        until = excluded.until,
        created_by = excluded.created_by,
        created_at = now()
    `;
  } else {
    await sql`
      delete from public.user_feature_blocks where user_id = ${opts.userId} and feature = ${opts.feature}
    `;
  }
  await writeAudit({
    adminId: opts.adminId,
    action: opts.blocked ? "feature_block" : "feature_unblock",
    targetUserId: opts.userId,
    targetLabel: opts.feature,
    notes: opts.blocked ? `until=${opts.until ?? "permanent"} reason=${opts.reason ?? ""}` : null,
  });
  return { ok: true as const };
}

/**
 * Verificatie in- of uitschakelen vanuit het adminportaal.
 *
 * Een geverifieerd account is het account op de schone namespace
 * (`rout.be/<handle>`) met het blauwe vinkje; de aliasruimte (`rout.be/u/…`)
 * toont daarna enkel het mens-symbool. Verifiëren kan pas wanneer de
 * wettelijke naam bekend is, want die naam zit achter het blauwe vinkje.
 */
export async function setUserVerified(opts: {
  adminId: string;
  userId: string;
  verified: boolean;
  /** Wettelijke naam; verplicht bij verifiëren, want die bepaalt de handle. */
  firstName?: string;
  lastName?: string;
  /** Optionele reden die in de afwijzingsmail komt. */
  reason?: string | null;
  /**
   * Zet de handle opnieuw op basis van de (nieuwe) wettelijke naam, ook als de
   * huidige handle al geldig is. Gebruikt door de admin-schakelaar
   * "gebruikersnaam mee wijzigen".
   */
  renameHandle?: boolean;
}) {
  const first = (opts.firstName ?? "").trim();
  const last = (opts.lastName ?? "").trim();

  if (first || last) {
    await sql`
      update public.profiles
         set legal_first_name = coalesce(nullif(${first}, ''), legal_first_name),
             legal_last_name = coalesce(nullif(${last}, ''), legal_last_name),
             updated_at = now()
       where id = ${opts.userId}
    `;
  }

  const rows = (await sql`
    select verified_legal_name, legal_first_name, legal_last_name, username,
           coalesce(forwarding_email, email) as email, preferred_language
      from public.profiles where id = ${opts.userId} limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return { ok: false as const, error: "Gebruiker niet gevonden." };

  const storedName =
    `${(row["legal_first_name"] as string | null) ?? ""} ${(row["legal_last_name"] as string | null) ?? ""}`.trim();
  const legalName =
    (first && last ? `${first} ${last}` : "") ||
    storedName ||
    ((row["verified_legal_name"] as string | null) ?? "").trim();

  // Zonder voor- én achternaam kan er geen geverifieerde handle bestaan, dus
  // weigeren we met een duidelijke melding in plaats van half te verifiëren.
  if (opts.verified && verifiedHandleSuggestionList(legalName).length === 0) {
    return {
      ok: false as const,
      error: "Vul eerst de wettelijke voor- én achternaam in; die bepaalt de geverifieerde handle.",
    };
  }

  await sql`
    update public.profiles
       set verified = ${opts.verified},
           verified_at = ${opts.verified ? new Date().toISOString() : null},
           verified_legal_name = ${opts.verified ? legalName : ((row["verified_legal_name"] as string | null) ?? null)},
           status = case when ${opts.verified} then 'active' else status end,
           updated_at = now()
     where id = ${opts.userId}
  `;

  // Verificatie promoot het account naar de pro-tier en zet de root-handle op
  // basis van de wettelijke naam, zodat de gebruiker van /u/<alias> naar
  // rout.be/voornaam.achternaam verhuist. De oude alias blijft bewaard.
  let promotedHandle: string | null = null;
  if (opts.verified) {
    await sql`
      update public.profiles
         set tier = 'pro', subdomain_tier = 'pro', updated_at = now()
       where id = ${opts.userId}
    `.catch((error: unknown) => {
      console.error("[verify] tier promotion failed", error);
    });

    const currentHandle = ((row["username"] as string | null) ?? "").trim().toLowerCase();
    const allowed = verifiedHandleSuggestionList(legalName);
    // Al een handle die bij de echte naam past? Dan blijft die staan.
    const alreadyOk =
      !opts.renameHandle && Boolean(currentHandle) && allowed.includes(currentHandle);

    if (!alreadyOk) {
      for (const candidate of allowed) {
        const taken = (await sql`
          select id from public.profiles
           where lower(username) = ${candidate} and id <> ${opts.userId} limit 1
        `) as Row[];
        if (taken.length) continue;
        await sql`
          update public.profiles
             set username = ${candidate},
                 subdomain_alias = coalesce(nullif(subdomain_alias, ''), nullif(${currentHandle}, '')),
                 updated_at = now()
           where id = ${opts.userId}
        `;
        promotedHandle = candidate;
        break;
      }
      if (!promotedHandle) {
        return {
          ok: false as const,
          error:
            "Alle handles op basis van deze naam zijn al in gebruik — kies handmatig een handle.",
        };
      }
    }
  }

  await writeAudit({
    adminId: opts.adminId,
    action: opts.verified ? "user_verified" : "user_unverified",
    targetUserId: opts.userId,
    targetLabel: (row["username"] as string | null) ?? null,
    notes: legalName || null,
  });

  // Brevo-dispatch: goedkeuring (blauw vinkje) of afwijzing van de verificatie.
  const notifyEmail = (row["email"] as string | null) ?? null;
  const notifyLanguage = (row["preferred_language"] as string | null) ?? "nl";
  if (notifyEmail) {
    const handle = promotedHandle ?? (row["username"] as string | null) ?? "";
    const origin = (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
    if (opts.verified) {
      await sendVerificationApproved({
        to: notifyEmail,
        language: notifyLanguage,
        legalName,
        handle,
        profileUrl: `${origin}/${handle}`,
      }).catch(() => undefined);
    } else {
      await sendVerificationRejected({
        to: notifyEmail,
        language: notifyLanguage,
        name: legalName || handle,
        reason: opts.reason ?? null,
      }).catch(() => undefined);
    }
  }

  return { ok: true as const, verified: opts.verified, legalName, promotedHandle };
}
