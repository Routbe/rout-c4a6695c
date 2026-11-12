import { sql } from "@/lib/neon";
import { claimRecordName, claimRecordValue, domainClaimHandle, nextClaimStatus, type ClaimStatus } from "./domain-claim-rules";

type Row = Record<string, unknown>;

export type DomainClaim = {
  id: string;
  domain: string;
  handle: string;
  status: ClaimStatus;
  recordName: string;
  recordValue: string;
  verifiedAt: string | null;
  failingSince: string | null;
};

function kek(): string {
  const k = process.env["ROUT_PROVIDER_SIGNING_KEK"];
  if (!k || k.length < 32) throw new Error("dns_claims_not_configured");
  return k;
}

async function toClaim(r: Row): Promise<DomainClaim> {
  const domain = String(r["domain"]);
  const t = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return {
    id: String(r["id"]),
    domain,
    handle: String(r["handle"]),
    status: r["status"] as ClaimStatus,
    recordName: claimRecordName(domain),
    recordValue: await claimRecordValue(kek(), String(r["user_id"]), domain),
    verifiedAt: t(r["verified_at"]),
    failingSince: t(r["failing_since"]),
  };
}

export async function listClaims(userId: string): Promise<DomainClaim[]> {
  const rows = (await sql`select * from public.domain_claims where user_id = ${userId} and status <> 'released'
    order by created_at desc limit 20`) as Row[];
  return Promise.all(rows.map(toClaim));
}

export async function startClaim(userId: string, rawDomain: string): Promise<DomainClaim> {
  const { domain, handle } = domainClaimHandle(rawDomain);
  const taken = (await sql`select user_id, status from public.domain_claims where domain = ${domain}`) as Row[];
  if (taken[0] && String(taken[0]["user_id"]) !== userId && taken[0]["status"] !== "released") throw new Error("domain_claimed");
  const rows = (await sql`insert into public.domain_claims (user_id, domain, handle)
      values (${userId}, ${domain}, ${handle})
      on conflict (domain) do update set user_id = excluded.user_id, status = 'pending', verified_at = null, failing_since = null
        where public.domain_claims.status = 'released' or public.domain_claims.user_id = excluded.user_id
      returning *`) as Row[];
  if (!rows[0]) throw new Error("domain_claimed");
  return toClaim(rows[0]);
}

async function recordPresent(userId: string, domain: string): Promise<boolean> {
  const { query } = await import("./domains.server");
  const expected = await claimRecordValue(kek(), userId, domain);
  const records = await query(claimRecordName(domain), "TXT");
  return records.some((r) => r.replace(/"\s*"/g, "") === expected);
}

/** First verification: TXT present → verified, identity link (dns_txt) + dns_verified badge. */
export async function verifyClaim(userId: string, claimId: string): Promise<DomainClaim> {
  const rows = (await sql`select * from public.domain_claims where id = ${claimId} and user_id = ${userId}`) as Row[];
  const row = rows[0];
  if (!row) throw new Error("not_found");
  const domain = String(row["domain"]);
  if (!(await recordPresent(userId, domain))) throw new Error("record_missing");
  const owner = (await sql`select user_id from public.domain_claims where handle = ${String(row["handle"])}
    and status in ('verified','grace') and id <> ${claimId} limit 1`) as Row[];
  if (owner[0]) throw new Error("handle_claimed");
  const updated = (await sql`update public.domain_claims set status = 'verified', verified_at = now(), last_checked_at = now(), failing_since = null
    where id = ${claimId} returning *`) as Row[];
  const { addLink } = await import("./identity/links.server");
  const value = await claimRecordValue(kek(), userId, domain);
  await addLink({
    userId,
    provider: "domain",
    proof: {
      issuer: "dns:txt",
      providerSub: domain,
      displayHandle: domain,
      proofMethod: "dns_txt",
      proofDigest: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${claimRecordName(domain)} ${value}`))),
    },
    stepUpMethod: "email_code",
    stepUpAt: new Date(),
  }).catch(() => undefined);
  await sql`insert into public.user_badges (user_id, badge_id)
    select ${userId}, b.id from public.badges b where b.slug = 'dns_verified'
      and not exists (select 1 from public.user_badges ub where ub.user_id = ${userId} and ub.badge_id = b.id)`.catch(() => undefined);
  return toClaim(updated[0]!);
}

export async function releaseClaim(userId: string, claimId: string) {
  await sql`update public.domain_claims set status = 'released' where id = ${claimId} and user_id = ${userId}`;
}

/** Cron: re-check verified/grace claims; release after 30 days of failing records. */
export async function recheckDomainClaims(limit = 50) {
  const rows = (await sql`select * from public.domain_claims where status in ('verified','grace')
    order by last_checked_at nulls first limit ${limit}`) as Row[];
  let released = 0;
  for (const r of rows) {
    let present = false;
    try {
      present = await recordPresent(String(r["user_id"]), String(r["domain"]));
    } catch {
      continue; // DNS outage: never count as failure.
    }
    const since = r["failing_since"] ? new Date(String(r["failing_since"])).getTime() : null;
    const next = nextClaimStatus(r["status"] as ClaimStatus, present, since, Date.now());
    if (next.status === "released") released++;
    await sql`update public.domain_claims set status = ${next.status}, last_checked_at = now(),
      failing_since = ${next.failingSince ? new Date(next.failingSince).toISOString() : null}
      where id = ${String(r["id"])}`;
  }
  return { checked: rows.length, released };
}
