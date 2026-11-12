/**
 * Identity relays: the registry of ROUT proxy addresses per member + connected
 * app. A relay row mirrors its forwarding rule (oauth_email_forwarding_rules),
 * which stays the delivery authority; both change together. The target is the
 * member's current primary address and self-heals when it changes, so a primary
 * email change never has to be pushed to apps that only know their proxy.
 */
import { sql } from "@/lib/neon";
import { forwardDomain } from "./email-forwarding.server";

type Row = Record<string, unknown>;

export type RelayStatus = "active" | "paused" | "revoked";

export interface IdentityRelay {
  id: string;
  appId: string;
  appName: string;
  proxyEmail: string;
  targetEmail: string;
  status: RelayStatus;
  updatedAt: string;
}

async function primaryEmail(userId: string): Promise<string | null> {
  const r = ((await sql`select email from public.users where id = ${userId} limit 1`) as Row[])[0];
  const e = r?.["email"];
  return typeof e === "string" && e.includes("@") ? e.toLowerCase() : null;
}

/** Upsert the registry row for a relay that was just created or re-activated. */
export async function recordRelay(userId: string, clientId: string, proxyEmail: string): Promise<void> {
  const target = await primaryEmail(userId);
  if (!target) return;
  await sql`insert into public.identity_relays (user_id, connected_app_id, proxy_email, target_email, status)
    values (${userId}, ${clientId}, ${proxyEmail.toLowerCase()}, ${target}, 'active')
    on conflict (user_id, connected_app_id) do update set proxy_email = excluded.proxy_email,
      target_email = excluded.target_email, status = 'active', updated_at = now()`;
}

/**
 * The member's relays. Forwarding rules without a registry row are adopted and
 * stale targets are healed to the current primary address in one transaction.
 */
export async function listRelays(userId: string): Promise<IdentityRelay[]> {
  const target = await primaryEmail(userId);
  if (target) {
    const domain = forwardDomain();
    await sql.transaction([
      sql`insert into public.identity_relays (user_id, connected_app_id, proxy_email, target_email, status)
        select r.user_id, r.client_id, r.alias_local || '@' || ${domain}, ${target}, r.status
        from public.oauth_email_forwarding_rules r
        join public.oauth_clients c on c.client_id = r.client_id
        where r.user_id = ${userId}
        on conflict (user_id, connected_app_id) do nothing`,
      sql`update public.identity_relays set target_email = ${target}, updated_at = now()
        where user_id = ${userId} and target_email <> ${target}`,
    ]);
  }
  const rows = (await sql`select r.id, r.connected_app_id, coalesce(c.name, r.connected_app_id) as app_name,
      r.proxy_email, r.target_email, r.status, r.updated_at
    from public.identity_relays r left join public.oauth_clients c on c.client_id = r.connected_app_id
    where r.user_id = ${userId} and r.status <> 'revoked'
    order by r.created_at desc limit 200`) as Row[];
  return rows.map((r) => ({
    id: String(r["id"]),
    appId: String(r["connected_app_id"]),
    appName: String(r["app_name"]),
    proxyEmail: String(r["proxy_email"]),
    targetEmail: String(r["target_email"]),
    status: String(r["status"]) as RelayStatus,
    updatedAt: new Date(String(r["updated_at"])).toISOString(),
  }));
}

/** Pause or resume one relay; the forwarding rule follows in the same transaction. */
export async function setRelayStatus(userId: string, relayId: string, status: "active" | "paused"): Promise<boolean> {
  const rows = (await sql`select connected_app_id from public.identity_relays
    where id = ${relayId} and user_id = ${userId} and status <> 'revoked' limit 1`) as Row[];
  const appId = rows[0]?.["connected_app_id"];
  if (typeof appId !== "string") return false;
  await sql.transaction([
    sql`update public.identity_relays set status = ${status}, updated_at = now()
      where id = ${relayId} and user_id = ${userId}`,
    sql`update public.oauth_email_forwarding_rules set status = ${status}, updated_at = now()
      where user_id = ${userId} and client_id = ${appId} and status <> 'revoked'`,
  ]);
  return true;
}
