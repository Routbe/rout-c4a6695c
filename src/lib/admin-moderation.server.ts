import { safeOrTerm } from "@/lib/db/search-term";
import type { UserSegment } from "./admin-segments";
/**
 * Server-only moderation, short-handle allocation, pagination and alias
 * monitoring helpers for the super admin portal.
 *
 * Every export assumes the caller was already proven to hold the `admin` role —
 * that check lives in `admin.functions.ts` via `assertAdminRole`.
 */

import { VIP_HANDLE_GRANT, needsVipGrant, normalizeHandleInput } from "./handle-rules";
import { writeAudit } from "./admin.server";
import { selectTolerant } from "./optional-columns";

const PERMANENT_BAN = "876000h"; // ~100 years

export type ModeratedUser = {
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  verified: boolean;
  tier: string;
  status: string;
  isSuspended: boolean;
  isBanned: boolean;
  isShadowbanned: boolean;
  moderationReason: string | null;
  handleGrant: string | null;
  /** Gratis/alias-identiteit: rout.be/u/<alias>. */
  subdomainAlias: string | null;
  /** Handle van het losstaande gratis aliasprofiel (`public.alias_profiles`). */
  aliasHandle: string | null;
  /** Staat het aliasprofiel publiek aan? */
  aliasEnabled: boolean;
  aliasStatus: string | null;
  forwardingEmail: string | null;
  blocks: { id?: string; label?: string; value?: string; kind?: string }[];
  createdAt: string | null;
  isPaid: boolean;
  paymentMethod: string | null;
  isEarlyBeliever: boolean;
  aliasSyncStatus: string;
  aliasSyncAttempts: number;
  aliasSyncedAt: string | null;
  aliasSyncError: string | null;
  lastCountry: string | null;
  lastCity: string | null;
};

const PROFILE_COLUMNS =
  "id, display_name, username, tagline, avatar_url, blocks, tier, verified, status, is_suspended, is_banned, is_shadowbanned, moderation_reason, handle_grant, alias_status, forwarding_email, created_at, is_paid, payment_method, is_early_believer, alias_sync_status, alias_sync_attempts, alias_synced_at, alias_sync_error, subdomain_alias, last_country, last_city";

type ProfileRow = Record<string, unknown>;

function mapProfile(row: ProfileRow, email: string | null): ModeratedUser {
  return {
    userId: String(row["id"]),
    email,
    displayName: (row["display_name"] as string | null) ?? null,
    username: (row["username"] as string | null) ?? null,
    tagline: (row["tagline"] as string | null) ?? null,
    avatarUrl: (row["avatar_url"] as string | null) ?? null,
    verified: Boolean(row["verified"]),
    tier: (row["tier"] as string | null) ?? "free",
    status: (row["status"] as string | null) ?? "active",
    isSuspended: Boolean(row["is_suspended"]),
    isBanned: Boolean(row["is_banned"]),
    isShadowbanned: Boolean(row["is_shadowbanned"]),
    moderationReason: (row["moderation_reason"] as string | null) ?? null,
    handleGrant: (row["handle_grant"] as string | null) ?? null,
    subdomainAlias: (row["subdomain_alias"] as string | null) ?? null,
    aliasHandle: (row["__alias_handle"] as string | null) ?? null,
    aliasEnabled: row["__alias_enabled"] !== false,
    aliasStatus: (row["alias_status"] as string | null) ?? null,
    forwardingEmail: (row["forwarding_email"] as string | null) ?? null,
    blocks: Array.isArray(row["blocks"]) ? (row["blocks"] as ModeratedUser["blocks"]) : [],
    createdAt: (row["created_at"] as string | null) ?? null,
    isPaid: Boolean(row["is_paid"]),
    paymentMethod: (row["payment_method"] as string | null) ?? null,
    isEarlyBeliever: Boolean(row["is_early_believer"]),
    aliasSyncStatus: (row["alias_sync_status"] as string | null) ?? "synced",
    aliasSyncAttempts: Number(row["alias_sync_attempts"] ?? 0),
    aliasSyncedAt: (row["alias_synced_at"] as string | null) ?? null,
    aliasSyncError: (row["alias_sync_error"] as string | null) ?? null,
    lastCountry: (row["last_country"] as string | null) ?? null,
    lastCity: (row["last_city"] as string | null) ?? null,
  };
}

/** Aliashandles van de zichtbare pagina in één query (tolerant: tabel kan ontbreken). */
async function readAliasHandles(
  userIds: string[],
): Promise<Map<string, { handle: string; enabled: boolean }>> {
  const map = new Map<string, { handle: string; enabled: boolean }>();
  if (userIds.length === 0) return map;
  try {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`
      select user_id, handle, enabled
        from public.alias_profiles
       where user_id = any(${userIds}::uuid[])
    `) as Record<string, unknown>[];
    for (const row of rows) {
      map.set(String(row["user_id"]), {
        handle: String(row["handle"] ?? ""),
        enabled: row["enabled"] !== false,
      });
    }
  } catch {
    // Migratie 38 nog niet uitgevoerd — dan tonen we simpelweg geen alias.
  }
  return map;
}

async function emailFor(userId: string): Promise<string | null> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data } = await dbAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export type Page<T> = { rows: T[]; total: number; page: number; perPage: number };

/** Server-side paginated user list with optional search on handle / name / id. */
/** Compact user-list segments, filtered server-side. */
export { USER_SEGMENTS } from "./admin-segments";
export type { UserSegment } from "./admin-segments";

export async function listUsersPage(opts: {
  query?: string;
  page?: number;
  perPage?: number;
  segment?: UserSegment;
  memberStatus?: "active" | "frozen" | "shadowbanned";
}): Promise<Page<ModeratedUser>> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, Math.max(5, opts.perPage ?? 20));
  const from = (page - 1) * perPage;

  const term = (opts.query ?? "").trim().replace(/^@/, "");
  const isUuid = /^[0-9a-f-]{36}$/i.test(term);
  // "2026", "2026-08" of "2026-08-14" → filter op registratiedatum.
  const dateMatch = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(term);

  const buildQuery = (cols: string) => {
    let q = dbAdmin
      .from("profiles")
      .select(cols, { count: "exact" })
      .order("created_at", { ascending: false });

    switch (opts.segment) {
      case "free":
        q = q.eq("tier", "free");
        break;
      case "verified_paid":
        q = q.eq("verified", true).eq("is_paid", true);
        break;
      case "alias_unsynced":
        // NULL counts as "never synced yet", which is also unsynced.
        q = q.or("alias_sync_status.neq.synced,alias_sync_status.is.null");
        break;
      case "suspended_or_banned":
        q = q.or("is_suspended.eq.true,is_banned.eq.true");
        break;
      default:
        break;
    }
    // Status filter runs in SQL (not per page in the browser) so paging and totals stay correct.
    // Mirrors memberStatus(): banned > suspended > frozen > shadowbanned > active.
    if (opts.memberStatus) {
      q = q.not("is_banned", "is", true).not("is_suspended", "is", true).not("status", "in", ["banned", "suspended"]);
      if (opts.memberStatus === "frozen") q = q.eq("status", "frozen");
      else {
        q = q.or("status.is.null,status.neq.frozen");
        q = opts.memberStatus === "shadowbanned" ? q.eq("is_shadowbanned", true) : q.not("is_shadowbanned", "is", true);
      }
    }
    return q;
  };

  let emailIds: string[] | null = null;
  if (term && term.includes("@")) {
    // E-mail search: resolve through the auth admin API first.
    const { data: list } = await dbAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    emailIds = ((list?.users ?? []) as Array<{ id: string; email?: string }>)
      .filter((u) => u.email?.toLowerCase().includes(term.toLowerCase()))
      .map((u) => u.id);
    if (emailIds.length === 0) return { rows: [], total: 0, page, perPage };
  }

  const applySearch = (q: ReturnType<typeof buildQuery>) => {
    if (!term) return q;
    if (isUuid) return q.eq("id", term);
    if (emailIds) return q.in("id", emailIds);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      const start = new Date(
        Date.UTC(Number(year), month ? Number(month) - 1 : 0, day ? Number(day) : 1),
      );
      const end = new Date(start);
      if (day) end.setUTCDate(end.getUTCDate() + 1);
      else if (month) end.setUTCMonth(end.getUTCMonth() + 1);
      else end.setUTCFullYear(end.getUTCFullYear() + 1);
      return q.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
    }
    const t = safeOrTerm(term);
    if (!t) return q;
    return q.or(
      `username.ilike.%${t}%,display_name.ilike.%${t}%,subdomain_alias.ilike.%${t}%`,
    );
  };

  const { data, count } = await selectTolerant<ProfileRow[]>(
    PROFILE_COLUMNS,
    (cols) =>
      applySearch(buildQuery(cols)).range(from, from + perPage - 1) as PromiseLike<{
        data: ProfileRow[] | null;
        error: unknown;
        count?: number | null;
      }>,
    ["last_country", "last_city", "is_shadowbanned"],
  ).then((r) => ({ data: r.data, count: (r as { count?: number | null }).count ?? null }));

  // Elke gebruiker heeft twee identiteiten: het geverifieerde rootprofiel en
  // het gratis aliasprofiel. Beide handles worden in één extra query opgehaald.
  const ids = (data ?? []).map((row) => String((row as ProfileRow)["id"]));
  const aliasByUser = await readAliasHandles(ids);

  const rows: ModeratedUser[] = [];
  for (const row of data ?? []) {
    const id = String((row as ProfileRow)["id"]);
    const alias = aliasByUser.get(id);
    rows.push(
      mapProfile(
        {
          ...(row as ProfileRow),
          __alias_handle: alias?.handle ?? null,
          __alias_enabled: alias?.enabled ?? true,
        },
        await emailFor(id),
      ),
    );
  }
  return { rows, total: count ?? rows.length, page, perPage };
}

/** Suspend / unsuspend: hides the public profile and disables dynamic QR redirects. */
export async function setSuspension(opts: {
  userId: string;
  suspended: boolean;
  reason?: string | null;
  adminId: string;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { error } = await dbAdmin
    .from("profiles")
    .update({
      is_suspended: opts.suspended,
      status: opts.suspended ? "suspended" : "active",
      moderation_reason: opts.suspended ? (opts.reason ?? null) : null,
      moderated_at: new Date().toISOString(),
      moderated_by: opts.adminId,
    })
    .eq("id", opts.userId);
  if (error) return { ok: false as const, reason: error.message };

  await dbAdmin.from("security_events").insert({
    user_id: opts.userId,
    kind: opts.suspended ? "profile_suspended" : "profile_reinstated",
    severity: opts.suspended ? "warning" : "info",
    message: opts.suspended
      ? "Your ROUT profile has been suspended by moderation."
      : "Your ROUT profile is live again.",
    details: { reason: opts.reason ?? null, admin_id: opts.adminId, notify: "email" },
  });

  await writeAudit({
    adminId: opts.adminId,
    action: opts.suspended ? "profile_suspended" : "profile_unsuspended",
    targetUserId: opts.userId,
    notes: opts.reason ?? null,
  });

  return { ok: true as const };
}

/** Permanent ban: blocks Auth sign-in, suspends the profile and freezes the alias. */
export async function setBan(opts: {
  userId: string;
  banned: boolean;
  reason?: string | null;
  adminId: string;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");

  const { error: authError } = await dbAdmin.auth.admin.updateUserById(opts.userId, {
    ban_duration: opts.banned ? PERMANENT_BAN : "none",
  });
  if (authError) return { ok: false as const, reason: authError.message };

  const { error } = await dbAdmin
    .from("profiles")
    .update({
      is_banned: opts.banned,
      is_suspended: opts.banned,
      status: opts.banned ? "banned" : "active",
      moderation_reason: opts.banned ? (opts.reason ?? null) : null,
      moderated_at: new Date().toISOString(),
      moderated_by: opts.adminId,
    })
    .eq("id", opts.userId);
  if (error) return { ok: false as const, reason: error.message };

  const { enqueueAliasJob, drainAliasSyncQueue } = await import("./alias-sync.server");
  await enqueueAliasJob(opts.userId, opts.banned ? "freeze" : "provision");
  await drainAliasSyncQueue(5);
  const alias = { ok: true as const, queued: true };

  await writeAudit({
    adminId: opts.adminId,
    action: opts.banned ? "user_banned" : "user_unbanned",
    targetUserId: opts.userId,
    notes: opts.reason ?? null,
  });

  return { ok: true as const, alias };
}

/**
 * Handle change tool. Short handles (1–4 characters) are only accepted with an
 * explicit VIP grant, and only for verified accounts. The new alias is synced
 * with ImprovMX and the previous one is released.
 */
export async function changeHandle(opts: {
  userId: string;
  handle: string;
  vipGrant?: boolean;
  adminId: string;
  /** Free-text justification, stored verbatim in the audit trail. */
  reason?: string | null;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const handle = normalizeHandleInput(opts.handle);
  if (!handle) return { ok: false as const, reason: "Handle cannot be empty." };

  const { data: profile } = await dbAdmin
    .from("profiles")
    .select("username, verified, handle_grant")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!profile) return { ok: false as const, reason: "Profile not found." };

  const short = needsVipGrant(handle);
  const grant = short || opts.vipGrant ? VIP_HANDLE_GRANT : null;
  if (short && !opts.vipGrant) {
    return {
      ok: false as const,
      reason: "This is a short handle — tick “VIP grant” to allocate it.",
    };
  }
  if (short && !profile.verified) {
    return { ok: false as const, reason: "Short handles can only go to verified accounts." };
  }

  const { data: taken } = await dbAdmin
    .from("profiles")
    .select("id")
    .ilike("username", handle)
    .neq("id", opts.userId)
    .limit(1);
  if ((taken ?? []).length > 0) {
    return { ok: false as const, reason: "Already taken by another account." };
  }

  // Behoud de gratis handle: bij een naamwijziging naar de geverifieerde
  // handle blijft de oude naam bestaan als aliasprofiel (rout.be/u/<naam>).
  if (profile.username && profile.username.toLowerCase() !== handle) {
    const { preserveFreeAliasHandle } = await import("@/lib/alias-profile.server");
    await preserveFreeAliasHandle(opts.userId, profile.username);
  }

  const { error } = await dbAdmin
    .from("profiles")
    .update({ username: handle, handle_grant: grant })
    .eq("id", opts.userId);
  if (error) return { ok: false as const, reason: error.message };

  const { enqueueAliasJob, drainAliasSyncQueue } = await import("./alias-sync.server");
  await enqueueAliasJob(opts.userId, "rename", { previousUsername: profile.username ?? null });
  await drainAliasSyncQueue(5);
  const alias = { ok: true as const, queued: true };

  const reason = opts.reason?.trim() || null;

  await dbAdmin.from("security_events").insert({
    user_id: opts.userId,
    kind: "handle_changed_by_admin",
    severity: "warning",
    message: `Your handle is now @${handle}.`,
    details: {
      previous: profile.username,
      handle,
      vip: Boolean(grant),
      admin_id: opts.adminId,
      reason,
    },
  });

  await writeAudit({
    adminId: opts.adminId,
    action: grant ? "vip_handle_granted" : "handle_changed",
    targetUserId: opts.userId,
    targetLabel: handle,
    notes: [
      `from @${profile.username ?? "—"}`,
      "alias sync queued",
      reason ? `reason: ${reason}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return { ok: true as const, handle, vip: Boolean(grant), alias, reason };
}

/**
 * Wijzigt de handle van het gratis aliasprofiel (`rout.be/u/<handle>`).
 * Los van de geverifieerde roothandle: eigen uniciteits- en formaatcheck.
 */
export async function changeAliasHandle(opts: {
  userId: string;
  handle: string;
  adminId: string;
  reason?: string | null;
}) {
  const { sql } = await import("@/lib/neon");
  const { normalizeHandleForStorage } = await import("./handle-rules");
  const { strictHandleIssue } = await import("./handle-validation");
  const { isReservedHandle } = await import("./profile");

  const handle = normalizeHandleForStorage(opts.handle);
  if (!handle) return { ok: false as const, reason: "Alias cannot be empty." };
  const issue = strictHandleIssue(handle, { alias: true });
  if (issue) return { ok: false as const, reason: issue };
  if (isReservedHandle(handle)) return { ok: false as const, reason: "Reserved system word." };

  const rootTaken = (await sql`
    select id from public.profiles
     where lower(username) = ${handle} and id <> ${opts.userId} limit 1
  `) as Record<string, unknown>[];
  if (rootTaken.length) return { ok: false as const, reason: "Already taken by a root profile." };

  try {
    const aliasTaken = (await sql`
      select user_id from public.alias_profiles
       where lower(handle) = ${handle} and user_id <> ${opts.userId} limit 1
    `) as Record<string, unknown>[];
    if (aliasTaken.length) return { ok: false as const, reason: "Already taken by another alias." };

    await sql`
      insert into public.alias_profiles (user_id, handle, updated_at)
      values (${opts.userId}, ${handle}, now())
      on conflict (user_id) do update set handle = excluded.handle, updated_at = now()
    `;
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : "Could not save the alias.",
    };
  }

  await writeAudit({
    adminId: opts.adminId,
    action: "alias_handle_changed",
    targetUserId: opts.userId,
    targetLabel: `u/${handle}`,
    notes: opts.reason?.trim() || null,
  });

  return { ok: true as const, handle };
}

/** Content cleansing: wipe the bio, reset the avatar or drop individual links. */
export async function cleanseContent(opts: {
  userId: string;
  clearTagline?: boolean;
  resetAvatar?: boolean;
  removeBlockIndexes?: number[];
  adminId: string;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data: profile } = await dbAdmin
    .from("profiles")
    .select("blocks")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!profile) return { ok: false as const, reason: "Profile not found." };

  const patch: {
    tagline?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    blocks?: unknown[];
  } = {};
  if (opts.clearTagline) {
    patch.tagline = null;
    patch.bio = null;
  }
  if (opts.resetAvatar) patch.avatar_url = null;

  const removals = new Set(opts.removeBlockIndexes ?? []);
  if (removals.size > 0) {
    const blocks = Array.isArray(profile.blocks) ? (profile.blocks as unknown[]) : [];
    patch.blocks = blocks.filter((_, index) => !removals.has(index));
  }
  if (Object.keys(patch).length === 0) return { ok: true as const };

  const { error } = await dbAdmin
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", opts.userId);

  if (error) return { ok: false as const, reason: error.message };

  await writeAudit({
    adminId: opts.adminId,
    action: "content_cleansed",
    targetUserId: opts.userId,
    notes: JSON.stringify({
      tagline: Boolean(opts.clearTagline),
      avatar: Boolean(opts.resetAvatar),
      links: [...removals],
    }),
  });

  return { ok: true as const };
}

export type AuditRow = {
  id: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetLabel: string | null;
  notes: string | null;
  createdAt: string;
};

export type AuditPageFilters = {
  adminEmail?: string;
  action?: string;
  from?: string;
  to?: string;
  /** Free-text search across action, admin, target and notes (server-side). */
  search?: string;
};

/** Range-based (server-side) pagination for the audit log. */
export async function fetchAuditPage(
  filters: AuditPageFilters = {},
  page = 1,
  perPage = 20,
): Promise<Page<AuditRow>> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const safePage = Math.max(1, page);
  const safePerPage = Math.min(100, Math.max(10, perPage));
  const from = (safePage - 1) * safePerPage;

  let q = dbAdmin
    .from("admin_audit_log")
    .select("id, admin_email, action, target_user_id, target_label, notes, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (filters.adminEmail) q = q.ilike("admin_email", `%${filters.adminEmail}%`);
  if (filters.search) {
    // Escape PostgREST's or() separators so a comma in the term cannot inject filters.
    const term = filters.search.replace(/[,()]/g, " ").trim();
    if (term) {
      q = q.or(
        [
          `action.ilike.%${term}%`,
          `admin_email.ilike.%${term}%`,
          `target_label.ilike.%${term}%`,
          `notes.ilike.%${term}%`,
        ].join(","),
      );
    }
  }
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.from) q = q.gte("created_at", new Date(filters.from).toISOString());
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    q = q.lte("created_at", to.toISOString());
  }

  const { data, count } = await q.range(from, from + safePerPage - 1);
  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      adminEmail: r.admin_email,
      action: r.action,
      targetUserId: r.target_user_id,
      targetLabel: r.target_label,
      notes: r.notes,
      createdAt: r.created_at,
    })),
    total: count ?? 0,
    page: safePage,
    perPage: safePerPage,
  };
}

/** Distinct action names, for the audit filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data } = await dbAdmin
    .from("admin_audit_log")
    .select("action")
    .order("created_at", { ascending: false })
    .limit(1000);
  return [...new Set((data ?? []).map((r) => r.action))].sort();
}

export type AliasRow = {
  userId: string;
  username: string | null;
  alias: string | null;
  forwardingEmail: string | null;
  aliasStatus: string;
  verified: boolean;
  isBanned: boolean;
  syncStatus: string;
  syncAttempts: number;
  syncedAt: string | null;
  syncError: string | null;
};

/** ImprovMX monitoring: local alias state joined with the remote health probe. */
export async function fetchNetworkOverview(page = 1, perPage = 20) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { aliasHealth } = await import("./alias.server");
  const { drainAliasSyncQueue, aliasQueueSummary } = await import("./alias-sync.server");
  const safePage = Math.max(1, page);
  const safePerPage = Math.min(100, Math.max(10, perPage));
  const from = (safePage - 1) * safePerPage;

  // Opening the tab also nudges the queue forward — retries never stall.
  await drainAliasSyncQueue(5);

  const { data, count } = await dbAdmin
    .from("profiles")
    .select(
      "id, username, alias_status, forwarding_email, verified, is_banned, alias_sync_status, alias_sync_attempts, alias_synced_at, alias_sync_error",
      { count: "exact" },
    )
    .not("username", "is", null)
    .order("alias_status", { ascending: true })
    .range(from, from + safePerPage - 1);

  const rows: AliasRow[] = (data ?? []).map((r) => ({
    userId: r.id,
    username: r.username,
    alias: r.username ? `${r.username}@rout.be` : null,
    forwardingEmail: r.forwarding_email ?? null,
    aliasStatus: r.alias_status ?? "none",
    verified: Boolean(r.verified),
    isBanned: Boolean(r.is_banned),
    syncStatus: r.alias_sync_status ?? "synced",
    syncAttempts: Number(r.alias_sync_attempts ?? 0),
    syncedAt: r.alias_synced_at ?? null,
    syncError: r.alias_sync_error ?? null,
  }));

  return {
    health: await aliasHealth(),
    queue: await aliasQueueSummary(),
    page: { rows, total: count ?? rows.length, page: safePage, perPage: safePerPage },
  };
}

/** Emergency alias control: pause (black-hole), resume or delete one alias. */
export async function controlAlias(opts: {
  userId: string;
  action: "pause" | "resume" | "delete";
  adminId: string;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { enqueueAliasJob, drainAliasSyncQueue } = await import("./alias-sync.server");

  let payload: Record<string, unknown> = {};
  if (opts.action === "pause") {
    const { data } = await dbAdmin
      .from("profiles")
      .select("username")
      .eq("id", opts.userId)
      .maybeSingle();
    if (!data?.username) return { ok: false as const, reason: "This account has no handle." };
    payload = { username: data.username };
    await dbAdmin.from("profiles").update({ alias_status: "paused" }).eq("id", opts.userId);
  }

  await enqueueAliasJob(opts.userId, opts.action, payload);
  const result = await drainAliasSyncQueue(5);

  await writeAudit({
    adminId: opts.adminId,
    action: `alias_${opts.action}`,
    targetUserId: opts.userId,
    notes: `queued · ${result.done} synced, ${result.failed} failed, ${result.retrying} retrying`,
  });

  return { ok: true as const, result };
}

/**
 * Manual payment override: marks the account paid, unlocks Early Believer
 * features and queues the @rout.be alias provisioning.
 */
export async function markUserPaid(opts: {
  userId: string;
  paid: boolean;
  adminId: string;
  note?: string | null;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { error } = await dbAdmin
    .from("profiles")
    .update({
      is_paid: opts.paid,
      is_early_believer: opts.paid,
      verified: opts.paid,
      verified_at: opts.paid ? new Date().toISOString() : null,
      tier: opts.paid ? "verified" : "free",
      payment_method: opts.paid ? "manual_admin" : null,
    })
    .eq("id", opts.userId);
  if (error) return { ok: false as const, reason: error.message };

  const { enqueueAliasJob, drainAliasSyncQueue } = await import("./alias-sync.server");
  await enqueueAliasJob(opts.userId, opts.paid ? "provision" : "delete");
  const sync = await drainAliasSyncQueue(5);

  await dbAdmin.from("security_events").insert({
    user_id: opts.userId,
    kind: opts.paid ? "manual_payment_verified" : "manual_payment_revoked",
    severity: "info",
    message: opts.paid
      ? "Your Early Believer status is active — your @rout.be alias is being created."
      : "Your Early Believer status was revoked.",
    details: { admin_id: opts.adminId, note: opts.note ?? null },
  });

  await writeAudit({
    adminId: opts.adminId,
    action: opts.paid ? "MANUAL_PAYMENT_VERIFICATION" : "manual_payment_revoked",
    targetUserId: opts.userId,
    notes: opts.note ?? `alias sync: ${sync.done} synced, ${sync.failed} failed`,
  });

  return { ok: true as const, sync };
}

export type BulkAction = "suspend" | "unsuspend" | "ban" | "cleanse";

/** Applies one moderation action to many accounts, reporting per-user results. */
export async function bulkModerate(opts: {
  userIds: string[];
  action: BulkAction;
  reason?: string | null;
  adminId: string;
}) {
  const ids = [...new Set(opts.userIds)].slice(0, 200);
  const results: { userId: string; ok: boolean; reason?: string }[] = [];

  for (const userId of ids) {
    let res: { ok: boolean; reason?: string };

    if (opts.action === "suspend" || opts.action === "unsuspend") {
      res = await setSuspension({
        userId,
        suspended: opts.action === "suspend",
        reason: opts.reason ?? null,
        adminId: opts.adminId,
      });
    } else if (opts.action === "ban") {
      res = await setBan({
        userId,
        banned: true,
        reason: opts.reason ?? null,
        adminId: opts.adminId,
      });
    } else {
      res = await cleanseContent({
        userId,
        clearTagline: true,
        resetAvatar: true,
        adminId: opts.adminId,
      });
    }
    results.push({ userId, ok: res.ok, ...(res.reason ? { reason: res.reason } : {}) });
  }

  const succeeded = results.filter((r) => r.ok).length;
  await writeAudit({
    adminId: opts.adminId,
    action: `bulk_${opts.action}`,
    targetLabel: `${succeeded}/${ids.length} accounts`,
    notes: opts.reason ?? null,
  });

  return { ok: true as const, succeeded, failed: ids.length - succeeded, results };
}

export type TransactionRow = {
  paymentId: string;
  userId: string;
  email: string | null;
  username: string | null;
  tier: string;
  method: string;
  reference: string | null;
  amountCents: number;
  donationCents: number;
  status: string;
  createdAt: string;
};

/** Paginated financial records for the Transactions tab (and its CSV export). */
export async function fetchTransactionsPage(opts: {
  status?: string;
  page?: number;
  perPage?: number;
}): Promise<Page<TransactionRow>> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 20));
  const from = (page - 1) * perPage;

  let q = dbAdmin
    .from("verification_payments")
    .select(
      "id, user_id, tier, amount_cents, donation_cents, provider, reference_code, status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);

  const { data, count } = await q.range(from, from + perPage - 1);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];

  const { data: profiles } = await dbAdmin
    .from("profiles")
    .select("id, username")
    .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  const emails = new Map<string, string | null>();
  for (const id of ids) {
    emails.set(id, await emailFor(id));
  }

  return {
    rows: rows.map((r) => ({
      paymentId: r.id,
      userId: r.user_id,
      email: emails.get(r.user_id) ?? null,
      username: byId.get(r.user_id) ?? null,
      tier: r.tier,
      method: r.provider ?? "unknown",
      reference: r.reference_code,
      amountCents: r.amount_cents,
      donationCents: r.donation_cents ?? 0,
      status: r.status,
      createdAt: r.created_at,
    })),
    total: count ?? rows.length,
    page,
    perPage,
  };
}

/** "Jan De Vries" (bank name) → free handle suggestions for name matching. */
export async function suggestHandlesFromBankName(bankName: string): Promise<string[]> {
  const { isHandleFree } = await import("./onboarding.server");
  const clean = bankName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (clean.length === 0) return [];

  const first = clean[0] ?? "";
  const last = clean[clean.length - 1] ?? "";
  const candidates = [
    clean.join("."),
    `${first}.${last}`,
    `${first}${last}`,
    `${first[0] ?? ""}${last}`,
    `${first}.${last[0] ?? ""}`,
  ].filter((c) => c.length >= 3);

  const free: string[] = [];
  for (const candidate of [...new Set(candidates)]) {
    const res = await isHandleFree(candidate);
    if (res.ok) free.push(candidate);
    if (free.length >= 4) break;
  }
  return free;
}

export type InboundPaymentRow = {
  eventId: string;
  reference: string;
  receivedAt: string;
  matched: boolean;
  status: string | null;
  amountCents: number | null;
  donationCents: number | null;
  userId: string | null;
  username: string | null;
  email: string | null;
};

/**
 * Re-runs the reference matcher for a single inbound event: looks the payment
 * up again against current accounts and activates it when it now resolves.
 */
export async function reprocessInboundPayment(eventId: string, adminId: string) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const reference = eventId.replace(/^inbound:/, "").toUpperCase();

  const { data: payment } = await dbAdmin
    .from("verification_payments")
    .select("id, user_id, tier, status")
    .eq("reference_code", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    return { ok: false as const, matched: false, reference, reason: "unknown_reference" };
  }
  if (payment.status === "paid") {
    return { ok: true as const, matched: true, reference, reason: "already_active" };
  }

  await dbAdmin
    .from("verification_payments")
    .update({ status: "paid", provider_ref: reference })
    .eq("id", payment.id);

  await dbAdmin
    .from("profiles")
    .update({
      is_paid: true,
      is_early_believer: true,
      payment_method: "bank_transfer_manual_reprocess",
      tier: payment.tier,
      verified: true,
      status: "active",
      verified_at: new Date().toISOString(),
    })
    .eq("id", payment.user_id);

  // Ook hier hoort het lid twee pagina's te krijgen: de gratis /u/-pagina
  // blijft en het geverifieerde profiel verhuist naar voornaam.achternaam.
  try {
    const { data: named } = await dbAdmin
      .from("profiles")
      .select("verified_legal_name")
      .eq("id", payment.user_id)
      .maybeSingle();
    const { ensureFreeAliasProfile } = await import("@/lib/alias-profile.server");
    await ensureFreeAliasProfile(payment.user_id);
    const { activateVerifiedRootHandle } = await import("@/lib/verified-root-handle.server");
    await activateVerifiedRootHandle(
      payment.user_id,
      (named as { verified_legal_name?: string | null } | null)?.verified_legal_name ?? null,
    );
  } catch (error) {
    console.error("verified root handle activation failed", error);
  }

  await writeAudit({
    adminId,
    action: "PAYMENT_REPROCESSED",
    targetUserId: payment.user_id,
    notes: `Reference ${reference} re-matched manually from the inbound audit table.`,
  });

  try {
    const { drainAliasSyncQueue } = await import("./alias-sync.server");
    await drainAliasSyncQueue(5);
  } catch (error) {
    console.error("alias drain after reprocess failed", error);
  }

  return { ok: true as const, matched: true, reference, reason: "activated" };
}

/**
 * Every `ROUT-XXXX` reference parsed out of an inbound bank notification,
 * joined with the payment (when one matched) and the account it activated.
 */
export async function fetchInboundPayments(
  page = 1,
  perPage = 20,
): Promise<Page<InboundPaymentRow>> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const safePage = Math.max(1, page);
  const safePerPage = Math.min(100, Math.max(10, perPage));
  const from = (safePage - 1) * safePerPage;

  const { data, count } = await dbAdmin
    .from("webhook_events")
    .select("id, source, kind, created_at", { count: "exact" })
    .eq("kind", "payment_email")
    .order("created_at", { ascending: false })
    .range(from, from + safePerPage - 1);

  const events = data ?? [];
  const references = events.map((e) => e.id.replace(/^inbound:/, ""));

  const { data: payments } = await dbAdmin
    .from("verification_payments")
    .select("user_id, reference_code, status, amount_cents, donation_cents")
    .in("reference_code", references.length > 0 ? references : ["__none__"]);

  const byReference = new Map((payments ?? []).map((p) => [p.reference_code ?? "", p]));

  const userIds = [...new Set((payments ?? []).map((p) => p.user_id))];
  const { data: profiles } = await dbAdmin
    .from("profiles")
    .select("id, username")
    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const handleById = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  const emails = new Map<string, string | null>();
  for (const id of userIds) emails.set(id, await emailFor(id));

  const rows: InboundPaymentRow[] = events.map((e) => {
    const reference = e.id.replace(/^inbound:/, "");
    const payment = byReference.get(reference);
    return {
      eventId: e.id,
      reference,
      receivedAt: e.created_at,
      matched: Boolean(payment),
      status: payment?.status ?? null,
      amountCents: payment?.amount_cents ?? null,
      donationCents: payment?.donation_cents ?? null,
      userId: payment?.user_id ?? null,
      username: payment ? (handleById.get(payment.user_id) ?? null) : null,
      email: payment ? (emails.get(payment.user_id) ?? null) : null,
    };
  });

  return { rows, total: count ?? rows.length, page: safePage, perPage: safePerPage };
}

/** Server-side CSV export of inbound bank references (admin-only, all rows). */
export async function exportInboundPayments(
  filters: {
    matched?: boolean;
    status?: "paid" | "pending" | "failed";
  } = {},
) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { INBOUND_CSV_COLUMNS, inboundCsvRows } = await import("./payments");
  const { toCsv } = await import("./csv");

  const q = dbAdmin
    .from("webhook_events")
    .select("id, source, kind, created_at")
    .eq("kind", "payment_email")
    .order("created_at", { ascending: false })
    .limit(5000);

  const { data: events } = await q;
  const allEvents = events ?? [];
  const references = allEvents.map((e) => e.id.replace(/^inbound:/, ""));

  const { data: payments } = await dbAdmin
    .from("verification_payments")
    .select("user_id, reference_code, status, amount_cents, donation_cents")
    .in("reference_code", references.length > 0 ? references : ["__none__"]);

  const byReference = new Map((payments ?? []).map((p) => [p.reference_code ?? "", p]));

  const userIds = [...new Set((payments ?? []).map((p) => p.user_id))];
  const { data: profiles } = await dbAdmin
    .from("profiles")
    .select("id, username")
    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const handleById = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));

  const emails = new Map<string, string | null>();
  for (const id of userIds) emails.set(id, await emailFor(id));

  let rows: InboundPaymentRow[] = allEvents.map((e) => {
    const reference = e.id.replace(/^inbound:/, "");
    const payment = byReference.get(reference);
    return {
      eventId: e.id,
      reference,
      receivedAt: e.created_at,
      matched: Boolean(payment),
      status: payment?.status ?? null,
      amountCents: payment?.amount_cents ?? null,
      donationCents: payment?.donation_cents ?? null,
      userId: payment?.user_id ?? null,
      username: payment ? (handleById.get(payment.user_id) ?? null) : null,
      email: payment ? (emails.get(payment.user_id) ?? null) : null,
    };
  });

  if (typeof filters.matched === "boolean") {
    rows = rows.filter((r) => r.matched === filters.matched);
  }
  if (filters.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }

  return {
    csv: toCsv(inboundCsvRows(rows), [...INBOUND_CSV_COLUMNS]),
    filename: `rout-inbound-payments-${new Date().toISOString().slice(0, 10)}.csv`,
    count: rows.length,
  };
}

/* ------------------------------------------------------------------ *
 * VIP short-handle grants (3–4 characters)                            *
 * ------------------------------------------------------------------ */

export type VipGrantRow = {
  userId: string;
  handle: string | null;
  displayName: string | null;
  verified: boolean;
  grantedAt: string;
  /** ImprovMX mirror: synced 🟢 / pending 🟡 / failed 🔴. */
  aliasSyncStatus: "synced" | "pending" | "failed";
  aliasSyncAttempts: number;
  aliasSyncedAt: string | null;
  aliasSyncError: string | null;
};

function normalizeSyncStatus(value: unknown): "synced" | "pending" | "failed" {
  return value === "synced" || value === "failed" ? value : "pending";
}

/** Every profile currently holding a VIP short-handle grant. */
export async function listVipGrants(): Promise<VipGrantRow[]> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data } = await dbAdmin
    .from("profiles")
    .select(
      "id, username, display_name, verified, updated_at, alias_sync_status, alias_sync_attempts, alias_synced_at, alias_sync_error",
    )
    .eq("handle_grant", VIP_HANDLE_GRANT)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((p) => ({
    userId: p.id,
    handle: p.username,
    displayName: p.display_name,
    verified: Boolean(p.verified),
    grantedAt: p.updated_at,
    aliasSyncStatus: normalizeSyncStatus(p.alias_sync_status),
    aliasSyncAttempts: p.alias_sync_attempts ?? 0,
    aliasSyncedAt: p.alias_synced_at ?? null,
    aliasSyncError: p.alias_sync_error ?? null,
  }));
}

/** Drop a VIP grant. Short handles must be re-assigned before revoking. */
export async function revokeVipGrant(opts: {
  userId: string;
  adminId: string;
  reason?: string | null;
}) {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data: profile } = await dbAdmin
    .from("profiles")
    .select("username, handle_grant")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!profile) return { ok: false as const, reason: "Profile not found." };
  if (profile.handle_grant !== VIP_HANDLE_GRANT) {
    return { ok: false as const, reason: "This account has no active VIP grant." };
  }
  if (profile.username && needsVipGrant(profile.username)) {
    return {
      ok: false as const,
      reason: `@${profile.username} is a short handle — assign a handle of 5+ characters first.`,
    };
  }

  const { error } = await dbAdmin
    .from("profiles")
    .update({ handle_grant: null })
    .eq("id", opts.userId);
  if (error) return { ok: false as const, reason: error.message };

  await dbAdmin.from("security_events").insert({
    user_id: opts.userId,
    kind: "vip_handle_revoked",
    severity: "warning",
    message: "Your VIP short-handle grant was revoked.",
    details: { handle: profile.username, admin_id: opts.adminId, reason: opts.reason ?? null },
  });

  await writeAudit({
    adminId: opts.adminId,
    action: "vip_handle_revoked",
    targetUserId: opts.userId,
    targetLabel: profile.username ?? null,
    notes:
      [profile.username ? `@${profile.username}` : null, opts.reason?.trim() || null]
        .filter(Boolean)
        .join(" · ") || null,
  });

  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Bulk grants                                                         *
 * ------------------------------------------------------------------ */

export type BulkGrantLine = {
  line: number;
  raw: string;
  handle: string | null;
  identifier: string | null;
  reason: string | null;
};

export type BulkGrantResult = BulkGrantLine & {
  ok: boolean;
  message: string;
  userId?: string;
};

/**
 * Parses a CSV/textarea payload. One grant per line:
 * `handle, email-or-handle-or-userid, optional reason`.
 * Lines starting with `#` and an optional `handle,...` header row are ignored.
 */
export function parseBulkGrantInput(input: string): BulkGrantLine[] {
  const rows: BulkGrantLine[] = [];
  input.split(/\r?\n/).forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const cells = trimmed.split(/[,;\t]/).map((c) => c.trim());
    const first = (cells[0] ?? "").toLowerCase().replace(/^@/, "");
    if (index === 0 && first === "handle") return; // header row
    rows.push({
      line: index + 1,
      raw: trimmed,
      handle: first || null,
      identifier: cells[1] || null,
      reason: cells.slice(2).join(", ").trim() || null,
    });
  });
  return rows;
}

/** Runs a parsed bulk payload sequentially so every row gets its own audit entry. */
export async function bulkGrantVipHandles(opts: {
  input: string;
  adminId: string;
  reason?: string | null;
}): Promise<{ results: BulkGrantResult[]; granted: number; failed: number }> {
  const { searchUsers } = await import("./admin.server");
  const rows = parseBulkGrantInput(opts.input).slice(0, 100);
  const results: BulkGrantResult[] = [];

  for (const row of rows) {
    const reason = row.reason ?? opts.reason ?? null;
    if (!row.handle || !row.identifier) {
      results.push({
        ...row,
        ok: false,
        message: "Expected `handle, email-or-handle-or-id, reason`.",
      });
      continue;
    }
    if (!needsVipGrant(normalizeHandleInput(row.handle))) {
      results.push({ ...row, ok: false, message: "Not a reserved short handle." });
      continue;
    }

    const matches = await searchUsers(row.identifier);
    if (matches.length === 0) {
      results.push({ ...row, ok: false, message: `No account matches “${row.identifier}”.` });
      continue;
    }
    if (matches.length > 1) {
      results.push({
        ...row,
        ok: false,
        message: `${matches.length} accounts match “${row.identifier}” — be more specific.`,
      });
      continue;
    }

    const target = matches[0]!;
    const res = await changeHandle({
      userId: target.userId,
      handle: row.handle,
      vipGrant: true,
      adminId: opts.adminId,
      reason,
    });
    results.push({
      ...row,
      userId: target.userId,
      ok: res.ok,
      message: res.ok ? `@${row.handle} granted to ${target.email ?? target.userId}` : res.reason,
    });
  }

  const granted = results.filter((r) => r.ok).length;
  return { results, granted, failed: results.length - granted };
}

/* ------------------------------------------------------------------ *
 * VIP audit trail                                                     *
 * ------------------------------------------------------------------ */

export const VIP_AUDIT_ACTIONS = [
  "vip_handle_granted",
  "vip_handle_revoked",
  "vip_alias_retry",
  "handle_changed",
] as const;

export type VipAuditFilters = {
  handle?: string;
  adminEmail?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type VipAuditEntry = {
  id: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetLabel: string | null;
  notes: string | null;
  createdAt: string;
};

/** Audit entries scoped to VIP/handle actions, filterable by handle, admin and date range. */
export async function fetchVipAuditLog(filters: VipAuditFilters = {}): Promise<VipAuditEntry[]> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  let q = dbAdmin
    .from("admin_audit_log")
    .select("id, admin_email, action, target_user_id, target_label, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 200, 500));

  q =
    filters.action && (VIP_AUDIT_ACTIONS as readonly string[]).includes(filters.action)
      ? q.eq("action", filters.action)
      : q.in("action", [...VIP_AUDIT_ACTIONS]);

  if (filters.adminEmail) q = q.ilike("admin_email", `%${filters.adminEmail}%`);
  if (filters.from) q = q.gte("created_at", new Date(filters.from).toISOString());
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    q = q.lte("created_at", to.toISOString());
  }

  const handle = safeOrTerm(filters.handle?.trim().replace(/^@/, "").toLowerCase() ?? "");
  if (handle) q = q.or(`target_label.ilike.%${handle}%,notes.ilike.%${handle}%`);

  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    adminEmail: r.admin_email,
    action: r.action,
    targetUserId: r.target_user_id,
    targetLabel: r.target_label,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

/* ------------------------------------------------------------------ *
 * Bulk VIP grant / alias retry — extends bulkModerate for the users   *
 * tab's multi-select toolbar.                                         *
 * ------------------------------------------------------------------ */

export type BulkVipResult = { userId: string; ok: boolean; reason?: string };

/**
 * Grants the VIP short-handle allowance to every selected account that is
 * verified and does not already hold it. Does not change the handle itself —
 * an admin still assigns the short handle afterwards via `changeHandle`.
 */
export async function bulkGrantVip(opts: {
  userIds: string[];
  adminId: string;
  reason?: string | null;
}): Promise<{ ok: true; succeeded: number; failed: number; results: BulkVipResult[] }> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const ids = [...new Set(opts.userIds)].slice(0, 200);
  const results: BulkVipResult[] = [];

  const { data: profiles } = await dbAdmin
    .from("profiles")
    .select("id, username, verified, handle_grant")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  for (const userId of ids) {
    const profile = byId.get(userId);
    if (!profile) {
      results.push({ userId, ok: false, reason: "Profile not found." });
      continue;
    }
    if (!profile.verified) {
      results.push({ userId, ok: false, reason: "Only verified accounts can hold a VIP grant." });
      continue;
    }
    if (profile.handle_grant === VIP_HANDLE_GRANT) {
      results.push({ userId, ok: true });
      continue;
    }
    const { error } = await dbAdmin
      .from("profiles")
      .update({ handle_grant: VIP_HANDLE_GRANT })
      .eq("id", userId);
    results.push(error ? { userId, ok: false, reason: error.message } : { userId, ok: true });
  }

  const succeeded = results.filter((r) => r.ok).length;
  await writeAudit({
    adminId: opts.adminId,
    action: "bulk_vip_grant",
    targetLabel: `${succeeded}/${ids.length} accounts`,
    notes: opts.reason ?? null,
  });

  return { ok: true, succeeded, failed: ids.length - succeeded, results };
}

/** Requeues the ImprovMX alias job for every selected account, one at a time. */
export async function bulkRetryAliasSync(opts: {
  userIds: string[];
  adminId: string;
}): Promise<{ ok: true; succeeded: number; failed: number; results: BulkVipResult[] }> {
  const { requeueUserAlias } = await import("./alias-sync.server");
  const ids = [...new Set(opts.userIds)].slice(0, 200);
  const results: BulkVipResult[] = [];

  for (const userId of ids) {
    try {
      const res = await requeueUserAlias(userId);
      results.push(
        res.failed > 0
          ? { userId, ok: false, reason: res.lastError ?? "Sync failed." }
          : { userId, ok: true },
      );
    } catch (error) {
      results.push({
        userId,
        ok: false,
        reason: error instanceof Error ? error.message : "Sync failed.",
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  await writeAudit({
    adminId: opts.adminId,
    action: "bulk_alias_retry",
    targetLabel: `${succeeded}/${ids.length} accounts`,
  });

  return { ok: true, succeeded, failed: ids.length - succeeded, results };
}

/* ------------------------------------------------------------------ *
 * System health KPIs                                                  *
 * ------------------------------------------------------------------ */

export type AdminKpis = {
  activeUsers: number;
  pendingVerifications: number;
  incompletePayments: number;
  pendingSepaPayments: number;
  failedAliasSyncs: number;
  improvmxConfigured: boolean;
};

/**
 * One lightweight aggregate query per metric, reusing the same tables the
 * portal's other tabs already read from — no new schema, just counts.
 */
export async function getAdminKpis(): Promise<AdminKpis> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { improvmxKey } = await import("./alias.server");
  const { sql } = await import("@/lib/neon");

  const [totalUsers, pendingUnique, incompletePayments, pendingSepaPayments, failedAliasSyncs] =
    await Promise.all([
      // "Actieve gebruikers" = alle geregistreerde profielen in Neon.
      sql`select count(*)::int as n from public.profiles` as Promise<
        Array<Record<string, unknown>>
      >,
      // Eén openstaande verificatie per gebruiker — nooit meer dan het aantal leden.
      sql`
        select count(distinct user_id)::int as n
          from public.verification_payments
         where status = 'pending'
      ` as Promise<Array<Record<string, unknown>>>,
      dbAdmin
        .from("verification_payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "incomplete"),
      dbAdmin
        .from("verification_payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("provider", "sepa"),
      dbAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("alias_sync_status", "failed"),
    ]);

  const activeUsers = Number(totalUsers[0]?.["n"] ?? 0);
  const pendingVerifications = Math.min(Number(pendingUnique[0]?.["n"] ?? 0), activeUsers);

  return {
    activeUsers,
    pendingVerifications,
    incompletePayments: incompletePayments.count ?? 0,
    pendingSepaPayments: pendingSepaPayments.count ?? 0,
    failedAliasSyncs: failedAliasSyncs.count ?? 0,
    improvmxConfigured: Boolean(improvmxKey()),
  };
}

/* ------------------------------------------------------------------ *
 * KPI drilldown — welke profielen zitten achter een getal?            *
 * ------------------------------------------------------------------ */

export type AdminKpiMetric =
  | "activeUsers"
  | "pendingVerifications"
  | "incompletePayments"
  | "pendingSepaPayments"
  | "failedAliasSyncs";

export type AdminKpiRow = {
  userId: string;
  username: string | null;
  displayName: string | null;
  detail: string | null;
};

/**
 * Levert de profielen achter één KPI-getal, zodat een admin op de tegel kan
 * klikken en meteen ziet om welke accounts het gaat.
 */
export async function getAdminKpiRows(metric: AdminKpiMetric, limit = 200): Promise<AdminKpiRow[]> {
  const { sql } = await import("@/lib/neon");
  const cap = Math.min(500, Math.max(1, limit));
  type Row = Record<string, unknown>;
  let rows: Row[] = [];

  if (metric === "activeUsers") {
    rows = (await sql`
      select id as user_id, username, display_name,
             to_char(created_at, 'YYYY-MM-DD') as detail
        from public.profiles
       order by created_at desc
       limit ${cap}
    `) as Row[];
  } else if (metric === "failedAliasSyncs") {
    rows = (await sql`
      select id as user_id, username, display_name,
             coalesce(alias_sync_error, 'alias sync failed') as detail
        from public.profiles
       where alias_sync_status = 'failed'
       order by created_at desc
       limit ${cap}
    `) as Row[];
  } else {
    const status = metric === "incompletePayments" ? "incomplete" : "pending";
    const sepaOnly = metric === "pendingSepaPayments";
    rows = (await sql`
      select p.id as user_id, p.username, p.display_name,
             concat_ws(' · ', v.provider, v.status,
                       to_char(v.created_at, 'YYYY-MM-DD')) as detail
        from public.verification_payments v
        join public.profiles p on p.id = v.user_id
       where v.status = ${status}
         and (${sepaOnly} = false or v.provider = 'sepa')
       order by v.created_at desc
       limit ${cap}
    `) as Row[];
  }

  return rows.map((r) => ({
    userId: String(r["user_id"]),
    username: (r["username"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    detail: (r["detail"] as string | null) ?? null,
  }));
}

/* ------------------------------------------------------------------ *
 * SEPA reference auto-parsing                                         *
 * ------------------------------------------------------------------ */

export type ReferenceMatch = {
  reference: string | null;
  matched: boolean;
  paymentId: string | null;
  userId: string | null;
  username: string | null;
  email: string | null;
  status: string | null;
};

/**
 * Parses a `ROUT-XXXXXX` reference out of a free-text bank description or
 * message and looks it up against pending verification payments, so the
 * admin gets a pre-filled match instead of relying on name matching alone.
 */
export async function matchPaymentByReference(text: string): Promise<ReferenceMatch> {
  const { parseRoutReference } = await import("./reference-parser");
  const reference = parseRoutReference(text);
  if (!reference) {
    return {
      reference: null,
      matched: false,
      paymentId: null,
      userId: null,
      username: null,
      email: null,
      status: null,
    };
  }

  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data: payment } = await dbAdmin
    .from("verification_payments")
    .select("id, user_id, status, reference_code")
    .eq("reference_code", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    return {
      reference,
      matched: false,
      paymentId: null,
      userId: null,
      username: null,
      email: null,
      status: null,
    };
  }

  const { data: profile } = await dbAdmin
    .from("profiles")
    .select("username")
    .eq("id", payment.user_id)
    .maybeSingle();

  return {
    reference,
    matched: true,
    paymentId: payment.id,
    userId: payment.user_id,
    username: profile?.username ?? null,
    email: await emailFor(payment.user_id),
    status: payment.status,
  };
}
