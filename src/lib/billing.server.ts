/**
 * Server-only leesacties voor de facturatiegeschiedenis van één lid.
 *
 * De factuur-PDF wordt bij het downloaden opnieuw opgebouwd uit de betaling
 * zelf: geen opslag van documenten, altijd het actuele ROUT-ontwerp, en de
 * nummering blijft identiek aan de mail die bij de betaling verstuurd werd.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export interface InvoiceSummary {
  paymentId: string;
  invoiceNumber: string;
  tier: string;
  provider: string;
  amountCents: number;
  currency: string;
  paidAt: string;
  reference: string;
}

/** Doorlopend factuurnummer: positie binnen alle betaalde betalingen. */
async function invoiceNumberFor(createdAt: string): Promise<string> {
  let sequence = 1;
  try {
    const rows = (await sql`
      select count(*)::int as n from public.verification_payments
       where status = 'paid' and created_at <= ${createdAt}
    `) as Row[];
    sequence = Math.max(1, Number(rows[0]?.["n"] ?? 1));
  } catch {
    /* nummering valt terug op 1 */
  }
  const year = new Date(createdAt).getUTCFullYear();
  return `ROUT-${year}-${String(sequence).padStart(5, "0")}`;
}

function amountOf(row: Row): number {
  return Math.max(0, Number(row["amount_cents"] ?? 0) + Number(row["donation_cents"] ?? 0));
}

/** Alle betaalde betalingen van het lid, nieuwste eerst. */
export async function fetchMyInvoices(userId: string): Promise<InvoiceSummary[]> {
  const rows = (await sql`
    select id, tier, provider, amount_cents, donation_cents, reference_code, created_at
      from public.verification_payments
     where user_id = ${userId} and status = 'paid'
     order by created_at desc
     limit 100
  `) as Row[];

  const out: InvoiceSummary[] = [];
  for (const row of rows) {
    const createdAt = String(row["created_at"]);
    out.push({
      paymentId: String(row["id"]),
      invoiceNumber: await invoiceNumberFor(createdAt),
      tier: String(row["tier"] ?? "verification"),
      provider: String(row["provider"] ?? "card"),
      amountCents: amountOf(row),
      currency: "EUR",
      paidAt: createdAt,
      reference: String(row["reference_code"] ?? row["id"]),
    });
  }
  return out;
}

/** Bouwt de factuur-PDF opnieuw op. Geeft `null` bij een onbekende betaling. */
export async function buildInvoicePdf(
  userId: string,
  paymentId: string,
): Promise<{ filename: string; base64: string } | null> {
  const rows = (await sql`
    select id, tier, provider, amount_cents, donation_cents, reference_code, created_at
      from public.verification_payments
     where id = ${paymentId} and user_id = ${userId} and status = 'paid'
     limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return null;

  const profileRows = (await sql`
    select handle, verified_legal_name from public.profiles where id = ${userId} limit 1
  `) as Row[];

  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data: account } = await dbAdmin.auth.admin.getUserById(userId);

  const baseCents = Number(payment["amount_cents"] ?? 0);
  const donationCents = Number(payment["donation_cents"] ?? 0);
  const createdAt = String(payment["created_at"]);
  const invoiceNumber = await invoiceNumberFor(createdAt);

  const lines = [
    {
      label: `ROUT verificatie — ${String(payment["tier"] ?? "verification")}`,
      amountCents: baseCents,
    },
  ];
  if (donationCents > 0) lines.push({ label: "Vrijwillige bijdrage", amountCents: donationCents });

  const { renderInvoicePdf } = await import("./invoice-pdf.server");
  return {
    filename: `${invoiceNumber}.pdf`,
    base64: renderInvoicePdf({
      invoiceNumber,
      issuedAt: new Date(createdAt),
      customerEmail: account?.user?.email ?? "",
      customerName: (profileRows[0]?.["verified_legal_name"] as string | null) ?? null,
      customerUsername: (profileRows[0]?.["handle"] as string | null) ?? null,
      customerId: userId,
      lines,
      totalCents: amountOf(payment),
      currency: "EUR",
      paymentMethod: String(payment["provider"] ?? "card"),
      reference: String(payment["reference_code"] ?? payment["id"]),
    }),
  };
}
