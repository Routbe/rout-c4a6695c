/**
 * Neon-backed data access + DNS lookups for custom-domain verification.
 *
 * DNS lookups run on the edge runtime, so we use Cloudflare's DNS-over-HTTPS
 * resolver instead of node:dns (which is not available there).
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

const DOH = "https://cloudflare-dns.com/dns-query";

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

export async function query(name: string, type: "TXT" | "CNAME" | "A"): Promise<string[]> {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const body = (await res.json()) as { Answer?: DohAnswer[] };
  return (body.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").trim());
}

export interface DnsCheck {
  txtFound: boolean;
  cnameFound: boolean;
  txtRecords: string[];
  targetRecords: string[];
}

/**
 * A domain counts as verified when the ownership TXT record is present AND the
 * host points at our edge (CNAME or A record).
 */
export async function checkDomainDns(
  domain: string,
  token: string,
  cnameTarget: string,
  aTarget: string,
): Promise<DnsCheck> {
  const [txt, cname, a] = await Promise.all([
    query(`_rout.${domain}`, "TXT").catch(() => [] as string[]),
    query(domain, "CNAME").catch(() => [] as string[]),
    query(domain, "A").catch(() => [] as string[]),
  ]);

  const normalize = (v: string) => v.replace(/\.$/, "").toLowerCase();
  const targetRecords = [...cname, ...a];

  return {
    txtFound: txt.some((v) => v === token || v === `rout-verify=${token}`),
    cnameFound:
      cname.some((v) => normalize(v) === normalize(cnameTarget)) || a.some((v) => v === aTarget),
    txtRecords: txt,
    targetRecords,
  };
}

export async function insertCustomDomain(userId: string, domain: string) {
  const token = `rout-verify-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  try {
    const rows = (await sql`
      insert into public.custom_domains (user_id, domain, verification_token)
      values (${userId}, ${domain}, ${token})
      returning *
    `) as Row[];
    return rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key|unique/i.test(message)) {
      throw new Error("That domain is already connected.");
    }
    throw new Error(message);
  }
}

export async function getOwnedDomain(id: string, userId: string): Promise<Row | null> {
  const rows = (await sql`
    select * from public.custom_domains where id = ${id} and user_id = ${userId} limit 1
  `) as Row[];
  return rows[0] ?? null;
}

export async function updateDomainStatus(id: string, status: string, verified: boolean) {
  const verifiedAt = verified ? new Date().toISOString() : null;
  await sql`
    update public.custom_domains
       set status = ${status},
           last_checked_at = now(),
           verified_at = ${verifiedAt},
           updated_at = now()
     where id = ${id}
  `;
}

export async function setDefaultDomainFor(userId: string, id: string) {
  await sql`update public.custom_domains set is_default = false where user_id = ${userId}`;
  await sql`
    update public.custom_domains
       set is_default = true, updated_at = now()
     where id = ${id} and user_id = ${userId}
  `;
}

export async function setDomainShortLinksFor(userId: string, id: string, enabled: boolean) {
  await sql`
    update public.custom_domains
       set short_links_enabled = ${enabled}, updated_at = now()
     where id = ${id} and user_id = ${userId}
  `;
}

export async function deleteDomainFor(userId: string, id: string) {
  await sql`delete from public.custom_domains where id = ${id} and user_id = ${userId}`;
}

export async function listDomainsFor(userId: string) {
  return (await sql`
    select * from public.custom_domains
     where user_id = ${userId}
     order by created_at desc
  `) as Row[];
}

/**
 * Reverse lookup for CNAME hosting: which handle should a request host render?
 *
 * Only verified domains resolve, so an unverified (or removed) domain can
 * never hijack a profile. Returns null for our own hosts and unknown domains.
 */
export async function findHandleForHost(host: string): Promise<string | null> {
  const clean = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!clean || /(^|\.)(rout\.be|rout\.app|lovable\.app|localhost)$/.test(clean)) return null;

  const rows = (await sql`
    select p.username
      from public.custom_domains d
      join public.profiles p on p.id = d.user_id
     where d.domain = ${clean}
       and d.status = 'verified'
       and coalesce(p.is_banned, false) = false
       and coalesce(p.is_suspended, false) = false
       and coalesce(p.status, 'active') not in ('frozen', 'banned', 'suspended')
       and coalesce((p.display_prefs->>'publicProfile')::boolean, true)
     limit 1
  `) as Row[];

  const username = rows[0]?.["username"];
  return typeof username === "string" && username ? username : null;
}

/**
 * Zet een geverifieerde domeinnaam als roothandle van dit profiel. De claim is
 * meteen actief zodat `rout.be/<domein>` het profiel toont.
 */
export async function setSubdomainAliasFor(userId: string, handle: string) {
  await sql`
    update public.profiles
       set subdomain_alias = ${handle},
           root_subdomain_status = 'active',
           updated_at = now()
     where id = ${userId}
  `;
}

/** Root redirect config of a verified custom domain + the owner's public handle (db/0128). */
export async function rootRedirectForHost(host: string) {
  const clean = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const rows = (await sql`
    select d.root_redirect_type::text as type, d.root_redirect_url as url,
           case when coalesce(p.is_banned, false) = false and coalesce(p.is_suspended, false) = false
                 and coalesce(p.status, 'active') not in ('frozen', 'banned', 'suspended')
                 and coalesce((p.display_prefs->>'publicProfile')::boolean, true)
                then p.username end as handle
      from public.custom_domains d
      left join public.profiles p on p.id = d.user_id
     where d.domain = ${clean} and d.status = 'verified'
     limit 1`) as Row[];
  const r = rows[0];
  if (!r) return null;
  return { type: String(r["type"]), url: (r["url"] as string | null) ?? null, handle: (r["handle"] as string | null) ?? null };
}

export async function setRootRedirectFor(userId: string, id: string, type: string, url: string | null) {
  await sql`update public.custom_domains set root_redirect_type = ${type}::public.root_redirect_kind,
    root_redirect_url = ${url}, updated_at = now() where id = ${id} and user_id = ${userId}`;
}
