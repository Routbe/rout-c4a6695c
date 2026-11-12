import { sql } from "@/lib/neon";
import { writeAudit } from "./admin.server";
import { memberStatus, type SettableStatus } from "./admin-members-rules";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** 360° view of one member. Caller must already have passed assertAdminRole. */
export async function getMember360(userId: string) {
  const p = ((await sql`select id, username, display_name, avatar_url, status, is_suspended, is_banned,
      coalesce(is_shadowbanned, false) as is_shadowbanned, created_at
    from public.profiles where id = ${userId} limit 1`) as Row[])[0];
  if (!p) return null;
  const email = (((await sql`select email from public.users where id = ${userId} limit 1`.catch(() => [])) as Row[])[0]?.["email"] as string | undefined) ?? null;

  const { listIdentities } = await import("./identities.server");
  const identities = (await listIdentities(userId).catch(() => [])).map((i) => {
    const r = i as unknown as Row;
    return { id: String(r["id"]), provider: String(r["provider"] ?? r["providerId"] ?? "?"), label: (r["label"] as string | null) ?? null };
  });

  const openWeb = ((await sql`select provider, handle, verified, verified_via from public.user_integrations
      where user_id = ${userId} order by provider`.catch(() => [])) as Row[]).map((r) => ({
    provider: String(r["provider"]),
    handle: (r["handle"] as string | null) ?? null,
    verified: Boolean(r["verified"]),
    via: (r["verified_via"] as string | null) ?? null,
  }));

  const badges = ((await sql`select b.name, ub.granted_at from public.user_custom_badges ub
      join public.custom_badges b on b.id = ub.badge_id where ub.user_id = ${userId} order by ub.granted_at desc`.catch(() => [])) as Row[]).map((r) => ({
    name: String(r["name"]),
    grantedAt: iso(r["granted_at"]),
  }));

  const sessions = email
    ? ((await sql`select s."createdAt" as created_at, s."updatedAt" as updated_at, s."ipAddress" as ip, s."userAgent" as ua
          from neon_auth.session s join neon_auth."user" u on u.id = s."userId"
          where lower(u.email) = lower(${email}) order by s."updatedAt" desc limit 5`.catch(() => [])) as Row[]).map((r) => ({
        createdAt: iso(r["created_at"]),
        lastSeen: iso(r["updated_at"]),
        ip: (r["ip"] as string | null) ?? null,
        userAgent: (r["ua"] as string | null) ?? null,
      }))
    : [];

  return {
    id: userId,
    handle: (p["username"] as string | null) ?? null,
    displayName: (p["display_name"] as string | null) ?? null,
    avatarUrl: (p["avatar_url"] as string | null) ?? null,
    email,
    createdAt: iso(p["created_at"]),
    status: memberStatus(p as never),
    identities,
    openWeb,
    badges,
    sessions,
    lastLogin: sessions[0]?.lastSeen ?? null,
  };
}

export async function setMemberStatus(adminId: string, userId: string, status: SettableStatus) {
  if (status === "active") {
    await sql`update public.profiles set status = 'active', is_suspended = false, is_shadowbanned = false, updated_at = now()
      where id = ${userId} and coalesce(is_banned, false) = false`;
  } else if (status === "frozen") {
    await sql`update public.profiles set status = 'frozen', is_shadowbanned = false, updated_at = now() where id = ${userId}`;
  } else {
    await sql`update public.profiles set status = 'active', is_suspended = false, is_shadowbanned = true, updated_at = now() where id = ${userId}`;
  }
  await writeAudit({ adminId, action: `member_status_${status}`, targetUserId: userId });
  return { ok: true as const };
}

export async function listOAuthApps() {
  const rows = (await sql`select c.id, c.client_id, c.name, c.redirect_uris, c.status, c.created_at, c.owner_user_id,
      p.username as owner_handle,
      (select v.status from public.oauth_client_verification_requests v where v.client_id = c.client_id
         order by v.created_at desc limit 1) as review_status
    from public.oauth_clients c left join public.profiles p on p.id = c.owner_user_id
    order by c.created_at desc limit 500`) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    clientId: String(r["client_id"]),
    name: String(r["name"] ?? ""),
    redirectUris: Array.isArray(r["redirect_uris"]) ? (r["redirect_uris"] as string[]) : [],
    blocked: r["status"] === "disabled",
    review: (r["review_status"] as string | null) ?? "none",
    owner: (r["owner_handle"] as string | null) ?? (r["owner_user_id"] ? null : "ROUT (systeem)"),
    createdAt: iso(r["created_at"]),
  }));
}

export async function actOnOAuthApp(adminId: string, id: string, action: "approve" | "reject" | "block" | "unblock") {
  const c = ((await sql`select client_id, name from public.oauth_clients where id = ${id} limit 1`) as Row[])[0];
  if (!c) throw new Error("App niet gevonden.");
  const clientId = String(c["client_id"]);
  if (action === "approve" || action === "reject") {
    const status = action === "approve" ? "verified" : "rejected";
    const open = (await sql`update public.oauth_client_verification_requests set status = ${status},
        reviewed_by = ${adminId}, reviewed_at = now() where client_id = ${clientId} and status = 'pending' returning id`) as Row[];
    if (open.length === 0) {
      await sql`insert into public.oauth_client_verification_requests (client_id, requested_by, note, status, reviewed_by, reviewed_at)
        values (${clientId}, ${adminId}, 'Beslissing door admin', ${status}, ${adminId}, now())`;
    }
  } else {
    await sql`update public.oauth_clients set status = ${action === "block" ? "disabled" : "active"} where id = ${id}`;
    if (action === "block") {
      await sql`update public.oauth_auth_codes set consumed_at = now() where client_id = ${clientId} and consumed_at is null`.catch(() => undefined);
    }
  }
  await writeAudit({ adminId, action: `oauth_app_${action}`, targetLabel: `${String(c["name"])} (${clientId})` });
  return { ok: true as const };
}
