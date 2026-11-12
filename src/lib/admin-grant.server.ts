/** Admin grants verification directly (no request). Caller must already be admin-checked. Server-only. */
import { sql } from "@/lib/neon";
import { allowedHandlesFor, normalizeDomain, type GrantTier } from "./admin-grant-rules";

type Row = Record<string, unknown>;

export async function listUserWorkspaces(userId: string) {
  const rows = (await sql`select w.id, w.name, w.domain from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where m.user_id = ${userId} order by w.created_at`) as Row[];
  return rows.map((r) => ({ id: String(r["id"]), name: String(r["name"]), domain: (r["domain"] as string | null) ?? null }));
}

function slugify(v: string) {
  const s = v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34);
  return `ws-${s || "bedrijf"}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function grantVerification(opts: {
  adminId: string;
  userId: string;
  tier: GrantTier;
  firstName?: string;
  lastName?: string;
  domain?: string;
  workspaceId?: string;
  workspaceName?: string;
  exceptions?: string[];
}) {
  const rule = allowedHandlesFor(opts);
  if (!rule.ok) return { ok: false as const, reason: rule.reason };
  const exists = (await sql`select 1 from public.profiles where id = ${opts.userId} limit 1`) as Row[];
  if (!exists.length) return { ok: false as const, reason: "Lid niet gevonden." };

  if (opts.tier === "business") {
    const domain = normalizeDomain(opts.domain ?? "")!;
    let wsId = opts.workspaceId ?? null;
    if (wsId) {
      const own = (await sql`select 1 from public.workspace_members where workspace_id = ${wsId}
        and user_id = ${opts.userId} limit 1`) as Row[];
      if (!own.length) return { ok: false as const, reason: "Dit lid hoort niet bij die workspace." };
    } else {
      const name = (opts.workspaceName ?? "").trim() || domain;
      const ws = (await sql`insert into public.workspaces (name, slug, plan)
        values (${name.slice(0, 80)}, ${slugify(name)}, 'business') returning id`) as Row[];
      wsId = String(ws[0]!["id"]);
      await sql`insert into public.workspace_members (workspace_id, user_id, role)
        values (${wsId}, ${opts.userId}, 'owner') on conflict do nothing`;
    }
    await sql`update public.workspaces set domain = ${domain}, domain_verified_at = now(), plan = 'business'
      where id = ${wsId}`;
    const ws = (await sql`select name from public.workspaces where id = ${wsId}`) as Row[];
    await sql`update public.profiles set is_business = true, business_name = ${String(ws[0]?.["name"] ?? domain)},
      verified = true, verified_at = coalesce(verified_at, now()), updated_at = now() where id = ${opts.userId}`;
    await sql`update public.business_verifications set status = 'approved', reviewed_at = now(),
      reviewed_by = ${opts.adminId} where user_id = ${opts.userId} and status in ('pending', 'incomplete')`.catch(() => null);
  } else {
    await sql`update public.profiles set legal_first_name = ${opts.firstName!.trim()},
      legal_last_name = ${opts.lastName!.trim()}, verified = true, verified_at = coalesce(verified_at, now()),
      is_influencer = ${opts.tier === "influencer"} or is_influencer, status = 'active', updated_at = now()
      where id = ${opts.userId}`;
    if (opts.tier === "influencer") {
      await sql`update public.influencer_requests set status = 'approved', reviewed_at = now(),
        reviewed_by = ${opts.adminId} where user_id = ${opts.userId}
        and status in ('pending', 'awaiting_payment', 'incomplete')`.catch(() => null);
    }
  }

  const { storeAllowedHandles } = await import("./approved-handles.server");
  await storeAllowedHandles(opts.userId, opts.tier, rule.handles);

  const { writeAudit } = await import("./admin.server");
  await writeAudit({
    adminId: opts.adminId,
    action: "verification_granted",
    targetUserId: opts.userId,
    targetLabel: opts.tier,
    notes: JSON.stringify({ tier: opts.tier, handles: rule.handles, exceptions: opts.exceptions ?? [], domain: opts.domain ?? null }),
  });

  if (opts.tier !== "pro") {
    void import("./verification-mail.server")
      .then(({ sendDecision }) => sendDecision(opts.userId, opts.tier as "influencer" | "business", { approved: true, handle: null }))
      .catch((e) => console.warn("[admin-grant] mail failed", e instanceof Error ? e.message : e));
  }
  return { ok: true as const, handles: rule.handles };
}
