/**
 * Operationele kerncijfers voor het admin-overzicht. Alleen aggregaten:
 * geen persoonsgegevens, geen rijen van individuele leden.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export interface AdminOverview {
  verifiedUsers: number;
  totalUsers: number;
  revenueCents: number;
  paymentsCount: number;
  activeDomains: number;
  webhooks: {
    id: string;
    source: string;
    kind: string | null;
    status: string;
    createdAt: string;
  }[];
}

function num(rows: Row[], key = "n"): number {
  return Number(rows[0]?.[key] ?? 0);
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const [verified, total, revenue, domains] = await Promise.all([
    sql`select count(*)::int as n from public.profiles where verified = true` as Promise<Row[]>,
    sql`select count(*)::int as n from public.profiles` as Promise<Row[]>,
    sql`
      select coalesce(sum(amount_cents + coalesce(donation_cents, 0)), 0)::int as n,
             count(*)::int as c
        from public.verification_payments
       where status = 'paid'
    ` as Promise<Row[]>,
    sql`select count(*)::int as n from public.custom_domains where verified_at is not null` as Promise<
      Row[]
    >,
  ]);

  let webhooks: AdminOverview["webhooks"] = [];
  try {
    const { fetchWebhookEvents } = await import("./monitoring.server");
    webhooks = (await fetchWebhookEvents({ limit: 8 })).map((event) => ({
      id: event.id,
      source: event.source,
      kind: event.kind,
      status: event.status,
      createdAt: event.created_at,
    }));
  } catch {
    /* de monitor mag het overzicht nooit blokkeren */
  }

  return {
    verifiedUsers: num(verified),
    totalUsers: num(total),
    revenueCents: num(revenue),
    paymentsCount: num(revenue, "c"),
    activeDomains: num(domains),
    webhooks,
  };
}
