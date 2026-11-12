/** Server-side entitlement engine: loads plan + overrides per scope and grants promotions. */
import { sql } from "@/lib/neon";
import { getWorkspaceRole } from "./workspaces.server";
import { earlyVerifiedGrants, scopeStorageSummary, type ScopeStorageSummary, ENTITLEMENT_KEYS, plusCredits, type Override, type Scope, type ScopeInput } from "./entitlement-engine";

type Row = Record<string, unknown>;

async function overridesFor(scopeType: "user" | "workspace", scopeId: string): Promise<Override[]> {
  return (await sql`select entitlement_key, value from public.entitlement_overrides
    where scope_type = ${scopeType} and scope_id = ${scopeId}`) as Override[];
}

/** Verifies the caller may act in the scope; throws Forbidden otherwise. */
export async function assertScopeAccess(userId: string, scope: Scope): Promise<void> {
  if (scope.type === "user") {
    if (scope.id !== userId) throw new Error("Forbidden");
    return;
  }
  if (!(await getWorkspaceRole(userId, scope.id))) throw new Error("Forbidden");
}

export async function loadScopeInput(scope: Scope): Promise<ScopeInput> {
  if (scope.type === "user") {
    const r = ((await sql`select verified, is_paid from public.profiles where id = ${scope.id} limit 1`) as Row[])[0] ?? {};
    return { scopeType: "user", basePlan: r["is_paid"] ? "pro" : "free", verified: Boolean(r["verified"]), overrides: await overridesFor("user", scope.id) };
  }
  const r = ((await sql`select w.plan,
      exists(select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
             where m.workspace_id = w.id and m.role = 'owner' and p.verified) as verified
    from public.workspaces w where w.id = ${scope.id} limit 1`) as Row[])[0] ?? {};
  return { scopeType: "workspace", basePlan: (r["plan"] as string) ?? "free", verified: Boolean(r["verified"]), overrides: await overridesFor("workspace", scope.id) };
}

export async function scopeUsedBytes(scope: Scope): Promise<number> {
  const rows = (scope.type === "user"
    ? await sql`select coalesce(sum(file_size),0)::bigint as b from public.user_assets where user_id = ${scope.id} and workspace_id is null`
    : await sql`select coalesce(sum(file_size),0)::bigint as b from public.user_assets where workspace_id = ${scope.id}`) as Row[];
  return Number(rows[0]?.["b"] ?? 0);
}

/** Idempotent: called whenever a user becomes verified. Grants only once (unique index). */
export async function grantEarlyVerifiedPromo(userId: string): Promise<void> {
  try {
    await sql`update public.profiles set is_early_verified = true where id = ${userId}`;
    for (const g of earlyVerifiedGrants(userId)) {
      await sql`insert into public.entitlement_overrides (scope_type, scope_id, entitlement_key, value, granted_by)
        values (${g.scope_type}, ${g.scope_id}, ${g.entitlement_key}, ${g.value}, 'early_verified_promo')
        on conflict (scope_type, scope_id, entitlement_key) do nothing`;
    }
  } catch (error) {
    console.error("[entitlements] early promo failed", error instanceof Error ? error.message : "unknown");
  }
}

/** Spends the user's single included Plus credit on a workspace they own. */
export async function redeemPlusWorkspace(userId: string, workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((await getWorkspaceRole(userId, workspaceId)) !== "owner") return { ok: false, error: "Forbidden" };
  if (plusCredits(await overridesFor("user", userId)) < 1) return { ok: false, error: "no_credit" };
  const spent = (await sql`update public.entitlement_overrides set value = (value::int - 1)::text
    where scope_type = 'user' and scope_id = ${userId} and entitlement_key = ${ENTITLEMENT_KEYS.INCLUDED_PLUS_WORKSPACE}
      and value ~ '^[0-9]+$' and value::int > 0 returning id`) as Row[];
  if (!spent.length) return { ok: false, error: "no_credit" };
  await sql`insert into public.entitlement_overrides (scope_type, scope_id, entitlement_key, value, granted_by)
    values ('workspace', ${workspaceId}, ${ENTITLEMENT_KEYS.WORKSPACE_PLAN}, 'plus', ${`user:${userId}`})
    on conflict (scope_type, scope_id, entitlement_key) do update set value = 'plus'`;
  // Chronos: agents waiting on a 402 resume automatically.
  const { emitAgentWebhook } = await import("./agent/chronos.server");
  await emitAgentWebhook(workspaceId, "workspace.upgraded");
  return { ok: true };
}

/** Shared quota gate for every upload path (presign and direct uploads) in the caller's active scope. */
export async function checkActiveScopeUpload(userId: string, bytes: number): Promise<{ ok: true } | { ok: false; status: 403; error: string }> {
  const { resolveActiveWorkspace } = await import("./workspaces.server");
  const { decidePresign } = await import("./entitlement-engine");
  const { workspaceId } = await resolveActiveWorkspace(userId);
  const scope: Scope = workspaceId ? { type: "workspace", id: workspaceId } : { type: "user", id: userId };
  const d = decidePresign(await loadScopeInput(scope), await scopeUsedBytes(scope), bytes);
  return d.ok ? { ok: true } : { ok: false, status: 403, error: d.error };
}

/** Storage summary for the caller's active scope (same scope resolution as checkActiveScopeUpload). */
export async function activeScopeStorage(userId: string): Promise<ScopeStorageSummary> {
  const { resolveActiveWorkspace } = await import("./workspaces.server");
  const { workspaceId } = await resolveActiveWorkspace(userId);
  const scope: Scope = workspaceId ? { type: "workspace", id: workspaceId } : { type: "user", id: userId };
  return scopeStorageSummary(await loadScopeInput(scope), await scopeUsedBytes(scope));
}

/** Effective plan of a workspace (stored plan + overrides such as a redeemed Plus credit). */
export async function workspaceEffectivePlan(workspaceId: string): Promise<string> {
  const { effectivePlan } = await import("./entitlement-engine");
  return effectivePlan(await loadScopeInput({ type: "workspace", id: workspaceId }));
}
