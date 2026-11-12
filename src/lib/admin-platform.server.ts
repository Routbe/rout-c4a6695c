/**
 * Admin portal: workspaces registry and the platform-wide handle registry.
 * Server-only; every caller is checked with assertAdminRole first.
 */
import { sql } from "@/lib/neon";
import { isReservedHandle } from "./profile";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  category: string | null;
  domain: string | null;
  domainVerifiedAt: string | null;
  publicProfile: boolean;
  createdAt: string | null;
  members: number;
  owners: string[];
}

export async function listWorkspacesForAdmin(opts: { search: string; limit: number }): Promise<AdminWorkspaceRow[]> {
  const q = opts.search.trim().toLowerCase();
  const like = `%${q}%`;
  const rows = (await sql`
    select w.id, w.name, w.slug, w.plan, w.category, w.domain, w.domain_verified_at, w.public_profile, w.created_at,
           (select count(*)::int from public.workspace_members m where m.workspace_id = w.id) as members,
           coalesce((select array_agg(u.email order by u.email) from public.workspace_members m
                      join public.users u on u.id = m.user_id
                     where m.workspace_id = w.id and m.role::text = 'owner'), '{}') as owners
      from public.workspaces w
     where ${q} = '' or lower(w.name) like ${like} or lower(coalesce(w.slug, '')) like ${like}
        or lower(coalesce(w.domain, '')) like ${like}
     order by w.created_at desc nulls last
     limit ${opts.limit}
  `) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    name: String(r["name"] ?? ""),
    slug: (r["slug"] as string | null) ?? null,
    plan: (r["plan"] as string | null) ?? null,
    category: (r["category"] as string | null) ?? null,
    domain: (r["domain"] as string | null) ?? null,
    domainVerifiedAt: iso(r["domain_verified_at"]),
    publicProfile: r["public_profile"] !== false,
    createdAt: iso(r["created_at"]),
    members: Number(r["members"] ?? 0),
    owners: Array.isArray(r["owners"]) ? (r["owners"] as unknown[]).map(String) : [],
  }));
}

export type WorkspaceAdminAction = "hide" | "show" | "revoke_domain";

export async function actOnWorkspace(adminId: string, workspaceId: string, action: WorkspaceAdminAction, note: string | null) {
  if (action === "hide" || action === "show") {
    await sql`update public.workspaces set public_profile = ${action === "show"} where id = ${workspaceId}::uuid`;
  } else {
    await sql`update public.workspaces set domain_verified_at = null where id = ${workspaceId}::uuid`;
  }
  const { writeAudit } = await import("./admin.server");
  await writeAudit({ adminId, action: `workspace.${action}`, targetLabel: workspaceId, notes: note }).catch(() => undefined);
  return { ok: true as const };
}

export interface HandleRegistryRow {
  handle: string;
  kind: "root" | "alias" | "domain_claim" | "workspace" | "approved";
  status: string | null;
  userId: string | null;
  email: string | null;
  label: string | null;
}

/** Who holds a name, in every namespace, plus whether the name is reserved. */
export async function searchHandleRegistry(query: string): Promise<{ reserved: boolean; rows: HandleRegistryRow[] }> {
  const q = query.trim().replace(/^@+/, "").toLowerCase();
  const like = `%${q}%`;
  const rows = (await sql`
    select * from (
      select p.username as handle, 'root' as kind, p.status as status, p.id as user_id, u.email, p.display_name as label
        from public.profiles p left join public.users u on u.id = p.id
       where p.username is not null and lower(p.username) like ${like}
      union all
      select p.subdomain_alias, 'domain_claim', p.status, p.id, u.email, p.display_name
        from public.profiles p left join public.users u on u.id = p.id
       where p.subdomain_alias is not null and lower(p.subdomain_alias) like ${like}
      union all
      select a.handle, 'alias', case when a.enabled then 'active' else 'disabled' end, a.user_id, u.email, a.display_name
        from public.alias_profiles a left join public.users u on u.id = a.user_id
       where lower(a.handle) like ${like}
      union all
      select w.slug, 'workspace', case when w.public_profile then 'public' else 'hidden' end, null, null, w.name
        from public.workspaces w where w.slug is not null and lower(w.slug) like ${like}
      union all
      select h.handle, 'approved', h.status, h.user_id, u.email, h.request_kind
        from public.approved_handles h left join public.users u on u.id = h.user_id
       where lower(h.handle) like ${like}
    ) t
    order by (lower(handle) = ${q}) desc, handle
    limit 100
  `) as Row[];
  return {
    reserved: q.length > 0 && isReservedHandle(q),
    rows: rows.map((r) => ({
      handle: String(r["handle"]),
      kind: String(r["kind"]) as HandleRegistryRow["kind"],
      status: (r["status"] as string | null) ?? null,
      userId: (r["user_id"] as string | null) ?? null,
      email: (r["email"] as string | null) ?? null,
      label: (r["label"] as string | null) ?? null,
    })),
  };
}
