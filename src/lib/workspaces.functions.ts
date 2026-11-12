import { isWorkspaceIconKey } from "./workspace-icons";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { WORKSPACE_ROLES, checkMemberChange, canManageTeam, canAssignRole, type WorkspaceRole } from "./workspace-rules";
import { unavailableWorkspaceContext } from "./workspace-availability";
import { workspaceBillingSchema } from "./workspace-pricing";

const roleSchema = z.enum(WORKSPACE_ROLES);
const uuid = z.string().uuid();

export type WorkspaceSummary = { id: string; name: string; slug: string; avatarUrl: string | null; icon: string | null; category: string | null; plan: string; role: WorkspaceRole };

/** Personal context + every workspace the caller belongs to, and which one is active. */
export const getWorkspaceContext = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
    const { currentUser } = await import("./auth/session.server");
    const user = await currentUser();
    if (!user) return unavailableWorkspaceContext();
    const { sql, withDbContext } = await import("@/lib/neon");
    return await withDbContext({ userId: user.id, workspaceId: null }, async () => {
    const { resolveActiveWorkspace } = await import("./workspaces.server");
    // Pending invites are accepted only for a verified email address, matched server-side.
    const email = user.emailConfirmedAt ? user.email.toLowerCase() : "";
    // Invites addressed to this account by @username are accepted too (matched by account id).
    await sql`select public.rout_accept_workspace_invites(${email || null})`;
    const rows = (await sql`
      select w.id, w.name, w.slug, w.avatar_url, w.icon, w.category, w.plan, m.role::text as role
      from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
      where m.user_id = ${user.id} order by w.name limit 100
    `) as { id: string; name: string; slug: string; avatar_url: string | null; icon: string | null; category: string | null; plan: string; role: WorkspaceRole }[];
    const active = await resolveActiveWorkspace(user.id);
    return {
      available: true as const,
      workspaces: rows.map((r): WorkspaceSummary => ({ id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url, icon: r.icon, category: r.category, plan: r.plan, role: r.role })),
      activeWorkspaceId: active.workspaceId,
      activeRole: active.role,
    };
    });
    } catch {
      console.error("[workspace-context] temporarily_unavailable");
      return unavailableWorkspaceContext();
    }
  });

export const setActiveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getWorkspaceRole, setActiveWorkspaceCookie } = await import("./workspaces.server");
    if (data.workspaceId && !(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("Forbidden");
    await setActiveWorkspaceCookie(data.workspaceId);
    return { ok: true as const };
  });

/** Own uploads only: the app's avatar route or an https storage URL. */
const logoUrl = z.string().max(500).refine((u) => /^\/api\/public\/avatar\?path=[0-9a-f-]{36}%2F[A-Za-z0-9._-]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u));

/** Owners/admins/editors change the workspace icon or logo. */
export const setWorkspaceIcon = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, icon: z.string().refine(isWorkspaceIconKey).nullable(), avatarUrl: logoUrl.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { assertWorkspaceRole } = await import("./workspaces.server");
    await assertWorkspaceRole(context.userId, data.workspaceId, ["owner", "admin", "editor"]);
    await sql`update public.workspaces set icon = ${data.icon}, avatar_url = ${data.avatarUrl} where id = ${data.workspaceId}::uuid`;
    return { ok: true as const };
  });

const wizardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional(),
  slugBase: z.string().trim().toLowerCase().max(34).optional(),
  category: z.enum(["business", "agency", "nonprofit", "event", "project"]).optional(),
  /** The suffix shown in the wizard preview; used when still free. */
  suffix: z.string().regex(/^[a-z0-9]{4}$/).optional(),
  invites: z.array(z.object({ target: z.string().trim().min(3).max(254), role: z.enum(["admin", "developer", "editor", "viewer"]) })).max(20).optional(),
  icon: z.string().refine(isWorkspaceIconKey).nullable().optional(),
  avatarUrl: logoUrl.nullable().optional(),
}).extend(workspaceBillingSchema.shape);

/** Is rout.be/w/<base>-xxxx still free for this base? (suffix keeps it unique; the base must be valid and not reserved). */
export const checkWorkspaceSlugBase = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ base: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { isValidWorkspaceSlug, randomSlugSuffix } = await import("./workspace-rules");
    const suffix = randomSlugSuffix();
    if (data.base.length < 3 || !isValidWorkspaceSlug(`${data.base}-${suffix}`)) return { ok: false as const, suffix, reason: "invalid" };
    const { sql } = await import("@/lib/neon");
    const taken = await slugTaken(`${data.base}-${suffix}`);
    return { ok: !taken, suffix, reason: taken ? "taken" : null };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => wizardSchema.parse(d))
  .handler(async ({ data, context }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("workspaces");
    const { sql } = await import("@/lib/neon");
    const { setActiveWorkspaceCookie } = await import("./workspaces.server");
    const { matrixWorkspaceSlug, isValidWorkspaceSlug } = await import("./workspace-rules");
    const { stepError } = await import("./workspace-wizard");
    const invites = data.invites ?? [];
    const teamErr = stepError("team", { name: data.name, description: "", avatarUrl: null, icon: null, slugBase: "", category: null, invites, plan_id: data.plan_id, billing_cycle: data.billing_cycle });
    if (teamErr) throw new Error(teamErr);
    const base = data.slugBase && data.slugBase.length >= 3 ? data.slugBase : data.name;
    let slug = "";
    // Nieuwe workspaces starten op het gratis plan: altijd een willekeurige suffix.
    for (let i = 0; i < 12 && !slug; i++) {
      const candidate = i === 0 && data.suffix ? matrixWorkspaceSlug(base, "free", data.suffix) : matrixWorkspaceSlug(base, "free");
      if (!isValidWorkspaceSlug(candidate)) continue;
      if (!(await slugTaken(candidate))) slug = candidate;
    }
    if (!slug) throw new Error("Geen vrij workspace-adres gevonden. Kies een andere naam.");
    const { resolveInvites } = await import("./workspaces.server");
    const resolved = await resolveInvites(invites, context.userId);
    const id = crypto.randomUUID();
    // Eén transactie: workspace, eigenaar en uitnodigingen bestaan samen of niet.
    await sql.transaction([
      sql`insert into public.workspaces (id, name, slug, description, category, icon, avatar_url)
          values (${id}::uuid, ${data.name}, ${slug}, ${data.description || null}, ${data.category ?? null}, ${data.icon ?? null}, ${data.avatarUrl ?? null})`,
      sql`insert into public.workspace_members (workspace_id, user_id, role) values (${id}::uuid, ${context.userId}, 'owner')`,
      ...resolved.map((i) => sql`insert into public.workspace_invites (workspace_id, email, role, invited_by, invited_user_id)
          values (${id}::uuid, ${i.email}, ${i.role}::public.workspace_role, ${context.userId}, ${i.userId}::uuid)
          on conflict (workspace_id, lower(email)) where status = 'pending' do nothing`),
    ]);
    await setActiveWorkspaceCookie(id);
    // Billing intent is validated, never trusted as proof of payment.
    return { id, slug, invited: resolved.length, plan_id: data.plan_id, billing_cycle: data.billing_cycle, active_plan: "tier_starter" as const };
  });

/** Slug check across all workspaces (RLS hides workspaces the caller is not in, so a definer helper answers). */
async function slugTaken(slug: string): Promise<boolean> {
  const { sql } = await import("@/lib/neon");
  const rows = (await sql`select public.rout_workspace_slug_taken(${slug}) as taken`) as { taken: boolean }[];
  return rows[0]?.taken === true;
}

export const listWorkspaceTeam = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { assertWorkspaceRole } = await import("./workspaces.server");
    const myRole = await assertWorkspaceRole(context.userId, data.workspaceId, ["owner", "admin"]);
    const members = (await sql`select * from public.rout_workspace_team(${data.workspaceId}::uuid)`) as { user_id: string; role: WorkspaceRole; created_at: string; email: string | null; username: string | null }[];
    const invites = (await sql`
      select i.id, i.email, i.role::text as role, i.created_at, p.username
      from public.workspace_invites i left join public.profiles p on p.id = i.invited_user_id
      where i.workspace_id = ${data.workspaceId} and i.status = 'pending' order by i.created_at desc limit 100
    `) as { id: string; email: string; role: WorkspaceRole; created_at: string; username: string | null }[];
    return {
      myRole,
      me: context.userId,
      members: members.map((m) => ({ userId: m.user_id, role: m.role, email: m.email, username: m.username, joinedAt: String(m.created_at) })),
      // Username invites show the handle only: the inviter never sees that account's e-mail address.
      invites: invites.map((i) => ({ id: i.id, label: i.username ? `@${i.username}` : i.email, role: i.role, createdAt: String(i.created_at) })),
    };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, userId: uuid, role: roleSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { assertWorkspaceRole, getWorkspaceRole, countOwners } = await import("./workspaces.server");
    const actor = await assertWorkspaceRole(context.userId, data.workspaceId, ["owner", "admin"]);
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "workspace_role");
    const target = await getWorkspaceRole(data.userId, data.workspaceId);
    if (!target) throw new Error("Dit lid bestaat niet meer.");
    const err = checkMemberChange(actor, { kind: "role", targetRole: target, nextRole: data.role }, await countOwners(data.workspaceId));
    if (err) throw new Error(err);
    await sql`update public.workspace_members set role = ${data.role}::public.workspace_role
              where workspace_id = ${data.workspaceId} and user_id = ${data.userId}`;
    return { ok: true as const };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, userId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { assertWorkspaceRole, getWorkspaceRole, countOwners } = await import("./workspaces.server");
    const actor = await assertWorkspaceRole(context.userId, data.workspaceId, ["owner", "admin"]);
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "workspace_role");
    const target = await getWorkspaceRole(data.userId, data.workspaceId);
    if (!target) return { ok: true as const };
    const err = checkMemberChange(actor, { kind: "remove", targetRole: target }, await countOwners(data.workspaceId));
    if (err) throw new Error(err);
    await sql`delete from public.workspace_members where workspace_id = ${data.workspaceId} and user_id = ${data.userId}`;
    return { ok: true as const };
  });

/** Invite by e-mail address or ROUT @username. Owner/admin only; owner role only from an owner. */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, target: z.string().trim().min(3).max(254), role: roleSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { assertWorkspaceRole } = await import("./workspaces.server");
    const actor = await assertWorkspaceRole(context.userId, data.workspaceId, ["owner", "admin"]);
    if (!canManageTeam(actor) || !canAssignRole(actor, data.role)) throw new Error("Alleen een eigenaar kan iemand eigenaar maken.");
    const { resolveInvites } = await import("./workspaces.server");
    const [invite] = await resolveInvites([{ target: data.target, role: data.role }], context.userId);
    if (!invite) throw new Error("Je bent zelf al lid van deze workspace.");
    const team = (await sql`select user_id, email from public.rout_workspace_team(${data.workspaceId}::uuid)`) as { user_id: string; email: string | null }[];
    if (team.some((m) => (invite.userId && m.user_id === invite.userId) || m.email?.toLowerCase() === invite.email)) throw new Error("Deze persoon is al lid.");
    await sql`
      insert into public.workspace_invites (workspace_id, email, role, invited_by, invited_user_id)
      values (${data.workspaceId}, ${invite.email}, ${data.role}::public.workspace_role, ${context.userId}, ${invite.userId}::uuid)
      on conflict (workspace_id, lower(email)) where status = 'pending'
      do update set role = excluded.role, invited_by = excluded.invited_by, invited_user_id = excluded.invited_user_id
    `;
    return { ok: true as const, label: invite.label };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, inviteId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { assertWorkspaceRole } = await import("./workspaces.server");
    await assertWorkspaceRole(context.userId, data.workspaceId, ["owner", "admin"]);
    await sql`update public.workspace_invites set status = 'revoked'
              where id = ${data.inviteId} and workspace_id = ${data.workspaceId} and status = 'pending'`;
    return { ok: true as const };
  });

/** Activates the scope named in the URL. Membership is checked server-side; unknown slugs are refused. */
export const activateScopeFromUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceSlug: z.string().trim().max(40).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole, setActiveWorkspaceCookie } = await import("./workspaces.server");
    if (!data.workspaceSlug) {
      await setActiveWorkspaceCookie(null);
      return { ok: true as const, workspaceId: null };
    }
    const rows = (await sql`select id from public.workspaces where slug = ${data.workspaceSlug} limit 1`) as { id: string }[];
    const id = rows[0]?.id;
    if (!id || !(await getWorkspaceRole(context.userId, id))) throw new Error("Forbidden");
    await setActiveWorkspaceCookie(id);
    return { ok: true as const, workspaceId: id };
  });

/** Renames the chosen part of the workspace username; the 4-char suffix stays. Owner/admin only. */
export const renameWorkspaceSlugBase = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, base: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    const { slugWithKeptSuffix } = await import("./workspace-rules");
    if (!canManageTeam(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("Alleen eigenaars en admins wijzigen de workspace-username.");
    const ws = ((await sql`select slug from public.workspaces where id = ${data.workspaceId} limit 1`) as { slug: string }[])[0];
    if (!ws) throw new Error("Workspace niet gevonden.");
    const next = slugWithKeptSuffix(ws.slug, data.base);
    if ("error" in next) throw new Error(next.error);
    if (next.slug === ws.slug) return { slug: ws.slug };
    const taken = ((await sql`select 1 from public.workspaces where lower(slug) = ${next.slug} and id <> ${data.workspaceId} limit 1`) as unknown[]).length > 0;
    if (taken) throw new Error("Deze username is al in gebruik.");
    try {
      await sql`update public.workspaces set slug = ${next.slug} where id = ${data.workspaceId}`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new Error("Deze username is al in gebruik.");
      throw e;
    }
    return { slug: next.slug };
  });

/** After an upgrade to Plus/Pro: drop the random suffix or set a clean slug. Owner/admin only. */
export const claimCleanWorkspaceSlug = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, slug: z.string().trim().toLowerCase().max(40).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    const { workspaceEffectivePlan } = await import("./entitlement-engine.server");
    const { hasBrandRelease } = await import("./reserved-brands.server");
    const { isReservedName } = await import("./reserved-brands");
    const { checkCleanSlugClaim, matrixWorkspaceSlug } = await import("./workspace-rules");
    const role = await getWorkspaceRole(context.userId, data.workspaceId);
    if (!canManageTeam(role)) throw new Error("Alleen eigenaars en admins wijzigen het workspace-adres.");
    const ws = ((await sql`select name, slug from public.workspaces where id = ${data.workspaceId} limit 1`) as { name: string; slug: string }[])[0];
    if (!ws) throw new Error("Workspace niet gevonden.");
    const plan = await workspaceEffectivePlan(data.workspaceId);
    const slug = data.slug || matrixWorkspaceSlug(ws.name, "pro");
    const reserved = isReservedName(slug).reserved;
    const brandReleased = reserved ? await hasBrandRelease(context.userId, slug) : false;
    const taken = ((await sql`select 1 from public.workspaces where lower(slug) = ${slug} and id <> ${data.workspaceId} limit 1`) as unknown[]).length > 0;
    const error = checkCleanSlugClaim({ plan, earlyVerified: await ownerEarlyVerified(data.workspaceId), slug, currentSlug: ws.slug, reserved, brandReleased, taken });
    if (error) throw new Error(error);
    try {
      await sql`update public.workspaces set slug = ${slug} where id = ${data.workspaceId}`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new Error("Dit workspace-adres is al in gebruik.");
      throw e;
    }
    return { slug };
  });

/** Early Verified bonus of the workspace owner (PRO_FOR_LIFE override), mirrored by db/0122. */
async function ownerEarlyVerified(workspaceId: string): Promise<boolean> {
  const { sql } = await import("@/lib/neon");
  const rows = (await sql`select 1 from public.workspace_members m
      join public.entitlement_overrides o on o.scope_type = 'user' and o.scope_id = m.user_id
       and o.entitlement_key = 'PRO_FOR_LIFE' and o.value = 'true'
     where m.workspace_id = ${workspaceId} and m.role = 'owner' limit 1`) as unknown[];
  return rows.length > 0;
}

function workspaceDomainKey(): string {
  const k = process.env["ROUT_PROVIDER_SIGNING_KEK"];
  if (!k || k.length < 32) throw new Error("Domeinverificatie is nog niet ingesteld op deze server.");
  return k;
}

export type WorkspaceSettings = {
  id: string; name: string; slug: string; plan: string; role: WorkspaceRole;
  earlyVerified: boolean; canDropSuffix: boolean; rootAlias: string | null;
  domain: { name: string; verified: boolean; recordName: string; recordValue: string | null } | null;
};

/** Everything the workspace settings page shows. Members only. */
export const getWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<WorkspaceSettings> => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    const { workspaceEffectivePlan } = await import("./entitlement-engine.server");
    const { planAllowsCleanSlug } = await import("./workspace-rules");
    const role = await getWorkspaceRole(context.userId, data.workspaceId);
    if (!role) throw new Error("Forbidden");
    const ws = ((await sql`select w.name, w.slug, w.domain, w.domain_verified_at,
        (select handle from public.workspace_root_aliases a where a.workspace_id = w.id) as root_alias
      from public.workspaces w where w.id = ${data.workspaceId} limit 1`) as Record<string, unknown>[])[0];
    if (!ws) throw new Error("Workspace niet gevonden.");
    const plan = await workspaceEffectivePlan(data.workspaceId);
    const earlyVerified = await ownerEarlyVerified(data.workspaceId);
    let domain: WorkspaceSettings["domain"] = null;
    if (ws["domain"]) {
      const { claimRecordName, claimRecordValue } = await import("./domain-claim-rules");
      const name = String(ws["domain"]);
      let recordValue: string | null = null;
      try { recordValue = await claimRecordValue(workspaceDomainKey(), data.workspaceId, name); } catch { recordValue = null; }
      domain = { name, verified: Boolean(ws["domain_verified_at"]), recordName: claimRecordName(name), recordValue };
    }
    return {
      id: data.workspaceId, name: String(ws["name"]), slug: String(ws["slug"]), plan, role, earlyVerified,
      canDropSuffix: planAllowsCleanSlug(plan, { earlyVerified }),
      rootAlias: (ws["root_alias"] as string | null) ?? null, domain,
    };
  });

export const renameWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, name: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    const { checkWorkspaceRename } = await import("./workspace-rules");
    const err = checkWorkspaceRename(await getWorkspaceRole(context.userId, data.workspaceId), data.name);
    if (err) throw new Error(err);
    await sql`update public.workspaces set name = ${data.name.trim()} where id = ${data.workspaceId}`;
    return { name: data.name.trim() };
  });

async function rootSlugDecision(userId: string, workspaceId: string, slug: string) {
  const { sql } = await import("@/lib/neon");
  const { workspaceEffectivePlan } = await import("./entitlement-engine.server");
  const { hasBrandRelease } = await import("./reserved-brands.server");
  const { isReservedName } = await import("./reserved-brands");
  const { findHandleOwner } = await import("./handle-namespace.server");
  const { RESERVED_SLUGS } = await import("./reserved-slugs");
  const { checkRootSlugClaim } = await import("./workspace-rules");
  const reserved = isReservedName(slug).reserved;
  const other = (await sql`select 1 from public.workspace_root_aliases where handle = ${slug} and workspace_id <> ${workspaceId} limit 1`) as unknown[];
  return checkRootSlugClaim({
    plan: await workspaceEffectivePlan(workspaceId),
    earlyVerified: await ownerEarlyVerified(workspaceId),
    slug,
    reserved,
    brandReleased: reserved ? await hasBrandRelease(userId, slug) : false,
    takenByHandle: other.length > 0 || (await findHandleOwner(slug)) !== null,
    systemRoute: RESERVED_SLUGS.has(slug),
  });
}

/** Live availability check for the root address field. Owner/admin only. */
export const checkRootWorkspaceSlug = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, slug: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getWorkspaceRole } = await import("./workspaces.server");
    if (!canManageTeam(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("Forbidden");
    return { error: await rootSlugDecision(context.userId, data.workspaceId, data.slug) };
  });

/** Claims rout.be/<slug> for a workspace (stored in workspace_root_aliases). Owner/admin only. */
export const claimRootWorkspaceSlug = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, slug: z.string().trim().toLowerCase().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    if (!canManageTeam(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("Alleen eigenaars en admins wijzigen het workspace-adres.");
    const err = await rootSlugDecision(context.userId, data.workspaceId, data.slug);
    if (err) throw new Error(err);
    try {
      await sql`insert into public.workspace_root_aliases (handle, workspace_id) values (${data.slug}, ${data.workspaceId})
                on conflict (workspace_id) do update set handle = excluded.handle, created_at = now()`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new Error("Dit adres is al in gebruik.");
      throw e;
    }
    return { handle: data.slug };
  });

export const setWorkspaceDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, domain: z.string().trim().toLowerCase().max(253).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    if (!canManageTeam(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("Alleen eigenaars en admins beheren domeinen.");
    const domain = data.domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
    if (domain && !/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw new Error("Vul een geldige domeinnaam in, bijvoorbeeld acme.be.");
    try {
      await sql`update public.workspaces set domain = ${domain}, domain_verified_at = null where id = ${data.workspaceId}`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new Error("Dit domein is al gekoppeld aan een andere workspace.");
      throw e;
    }
    return { ok: true as const };
  });

/** Checks the TXT record _rout.<domain> with the existing DNS lookup. */
export const verifyWorkspaceDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole } = await import("./workspaces.server");
    const { claimRecordName, claimRecordValue } = await import("./domain-claim-rules");
    const { query } = await import("./domains.server");
    if (!canManageTeam(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("Alleen eigenaars en admins beheren domeinen.");
    const row = ((await sql`select domain from public.workspaces where id = ${data.workspaceId}`) as { domain: string | null }[])[0];
    if (!row?.domain) throw new Error("Koppel eerst een domein.");
    const expected = await claimRecordValue(workspaceDomainKey(), data.workspaceId, row.domain);
    const records = await query(claimRecordName(row.domain), "TXT");
    const ok = records.some((r) => r.replace(/"\s*"/g, "") === expected);
    if (ok) {
      await sql`update public.workspaces set domain_verified_at = now() where id = ${data.workspaceId}`;
      // Chronos: agents waiting on DNS verification resume automatically.
      const { emitAgentWebhook } = await import("./agent/chronos.server");
      await emitAgentWebhook(data.workspaceId, "domain.verified");
    }
    return { verified: ok };
  });

/** Deletes the workspace. Owner only, after typing the exact name; FKs cascade members, invites and assets. */
export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: uuid, confirmation: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const { getWorkspaceRole, setActiveWorkspaceCookie } = await import("./workspaces.server");
    const { checkWorkspaceDelete } = await import("./workspace-rules");
    const ws = ((await sql`select name from public.workspaces where id = ${data.workspaceId}`) as { name: string }[])[0];
    if (!ws) throw new Error("Workspace niet gevonden.");
    const err = checkWorkspaceDelete(await getWorkspaceRole(context.userId, data.workspaceId), ws.name, data.confirmation);
    if (err) throw new Error(err);
    await sql`delete from public.workspaces where id = ${data.workspaceId}`;
    await setActiveWorkspaceCookie(null);
    return { ok: true as const };
  });

// De vereenvoudigde hub-editor (getWorkspaceHub/saveWorkspaceHub) is verwijderd:
// één Studio-engine — workspaces bewerken via de gedeelde ProfileEditor
// (workspace-studio.functions.ts) en publiceren naar public_profile.studio.
