import { escapeMailParam } from "@/lib/mail-param-escape";
/**
 * Root-subdomein claims: audit-log leesacties, handmatige promotie en de
 * geautomatiseerde DNS-propagatiecontrole. Server-only (Neon).
 */
import { sql } from "@/lib/neon";

export type ClaimRow = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  requestedSubdomain: string;
  adminMailStatus: string;
  userMailStatus: string;
  errorPayload: string | null;
  status: string;
  rootStatus: string | null;
  dnsPromotedAt: string | null;
  createdAt: string;
};

function toRow(r: Record<string, unknown>): ClaimRow {
  return {
    id: String(r["id"]),
    userId: String(r["user_id"]),
    username: (r["username"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    email: (r["email"] as string | null) ?? null,
    requestedSubdomain: String(r["requested_subdomain"]),
    adminMailStatus: String(r["admin_mail_status"]),
    userMailStatus: String(r["user_mail_status"]),
    errorPayload:
      r["error_payload"] == null
        ? null
        : typeof r["error_payload"] === "string"
          ? (r["error_payload"] as string)
          : JSON.stringify(r["error_payload"]),
    status: String(r["status"] ?? "pending_dns"),
    rootStatus: (r["root_subdomain_status"] as string | null) ?? null,
    dnsPromotedAt: (r["dns_promoted_at"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  };
}

/** Volledige audit-log voor beheerders, met status- en zoekfilter. */
export async function fetchRootClaims(filters: {
  status?: "all" | "pending_dns" | "active" | "failed_mail";
  search?: string;
  limit?: number;
}): Promise<ClaimRow[]> {
  const status = filters.status ?? "all";
  const search = (filters.search ?? "").trim().toLowerCase();
  const like = search ? `%${search}%` : null;
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);

  const rows = (await sql`
    select c.*, p.username, p.display_name, p.email, p.root_subdomain_status
      from public.subdomain_root_claims c
      left join public.profiles p on p.id = c.user_id
     where (${status} = 'all'
            or (${status} = 'pending_dns' and coalesce(p.root_subdomain_status, c.status) = 'pending_dns')
            or (${status} = 'active' and coalesce(p.root_subdomain_status, c.status) = 'active')
            or (${status} = 'failed_mail' and (c.admin_mail_status <> 'sent' or c.user_mail_status <> 'sent')))
       and (${like}::text is null
            or lower(coalesce(p.username, '')) like ${like}
            or lower(coalesce(p.display_name, '')) like ${like}
            or lower(coalesce(p.email, '')) like ${like}
            or lower(c.requested_subdomain) like ${like})
     order by c.created_at desc
     limit ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

/** Claims van één gebruiker (Studio-overzicht). */
export async function fetchMyClaims(userId: string): Promise<ClaimRow[]> {
  const rows = (await sql`
    select c.*, p.username, p.display_name, p.email, p.root_subdomain_status
      from public.subdomain_root_claims c
      left join public.profiles p on p.id = c.user_id
     where c.user_id = ${userId}
     order by c.created_at desc
     limit 20
  `) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

/** Forceert `pending_dns` → `active` (beheerdersactie of DNS-cron). */
export async function promoteClaim(userId: string): Promise<void> {
  await sql`
    update public.profiles
       set root_subdomain_status = 'active'
     where id = ${userId}
  `;
  await sql`
    update public.subdomain_root_claims
       set status = 'active', dns_promoted_at = now()
     where user_id = ${userId} and dns_promoted_at is null
  `;
  const { later, recipient, sendSiteMail } = await import("./site-mail.server");
  later(async () => {
    const rows = (await sql`select username from public.profiles where id = ${userId} limit 1`) as Record<string, unknown>[];
    const handle = String(rows[0]?.["username"] ?? "").toLowerCase();
    if (!handle) return;
    const r = await recipient(userId);
    const { subdomainMail } = await import("@/emails/site-mails");
    await sendSiteMail(r.email, subdomainMail({ lang: r.lang, name: r.name, subdomain: `${handle}.rout.be`, stage: "active", url: `https://${handle}.rout.be` }), ["subdomain", "active"]);
  });
}

const DOH = "https://cloudflare-dns.com/dns-query";
const EXPECTED_CNAME = "cname.vercel-dns.com";

/** CNAME-resolutie via DNS-over-HTTPS (geen Node `dns` in de Worker-runtime). */
export async function resolvesToVercel(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(host)}&type=CNAME`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { Answer?: Array<{ data?: string }> };
    return (json.Answer ?? []).some((a) =>
      String(a.data ?? "")
        .replace(/\.$/, "")
        .toLowerCase()
        .endsWith(EXPECTED_CNAME),
    );
  } catch {
    return false;
  }
}

/** Cron: promoot elk `pending_dns`-profiel waarvan de CNAME correct staat. */
export async function runDnsPropagationCheck(): Promise<{
  checked: number;
  promoted: string[];
}> {
  const rows = (await sql`
    select id, coalesce(subdomain_alias, username) as handle
      from public.profiles
     where root_subdomain_status = 'pending_dns'
     limit 200
  `) as Array<{ id: string; handle: string | null }>;

  const promoted: string[] = [];
  for (const row of rows) {
    const handle = (row.handle ?? "").toLowerCase();
    if (!handle) continue;
    const host = `${handle}.rout.be`;
    if (await resolvesToVercel(host)) {
      await promoteClaim(row.id);
      promoted.push(host);
    }
  }
  return { checked: rows.length, promoted };
}

/** Herverstuurt de claimmails (via de MailAdapter) voor een bestaande claim. */
export async function resendClaimMails(claimId: string): Promise<{
  admin_email: string;
  user_email: string;
}> {
  const rows = (await sql`
    select c.id, c.requested_subdomain, p.email, p.display_name, p.username
      from public.subdomain_root_claims c
      left join public.profiles p on p.id = c.user_id
     where c.id = ${claimId}
     limit 1
  `) as Array<Record<string, unknown>>;
  const claim = rows[0];
  if (!claim) throw new Error("Claim niet gevonden");

  const subdomain = String(claim["requested_subdomain"]);
  const email = (claim["email"] as string | null) ?? null;
  const userName =
    (claim["display_name"] as string | null) || (claim["username"] as string | null) || "ROUT-lid";
  const { sendClaimMails } = await import("@/lib/subdomain-claim-mails.server");
  const mails = await sendClaimMails({ subdomain, userName, userEmail: email });
  const admin = mails.admin.status;
  const userMail = mails.user.status;

  await sql`
    update public.subdomain_root_claims
       set admin_mail_status = ${admin}, user_mail_status = ${userMail}
     where id = ${claimId}
  `;
  return { admin_email: admin, user_email: userMail };
}
