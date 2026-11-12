/**
 * Aflevermonitor: welke betaling kreeg een genummerde factuur-PDF en een
 * Brevo-bevestiging, en welke moet opnieuw. Leest `public.invoice_deliveries`
 * en kan één afhandeling volledig opnieuw laten lopen.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export interface DeliveryRow {
  payment_id: string;
  user_id: string | null;
  email: string | null;
  invoice_number: string | null;
  template: string | null;
  attached: boolean;
  emailed: boolean;
  status: string;
  error: string | null;
  attempts: number;
  updated_at: string;
  amount_cents: number | null;
}

export async function fetchDeliveries(onlyFailed: boolean): Promise<DeliveryRow[]> {
  try {
    const rows = (await sql`
      select d.payment_id, d.user_id, d.invoice_number, d.template, d.attached, d.emailed,
             d.status, d.error, d.attempts, d.updated_at,
             u.email,
             (coalesce(p.amount_cents, 0) + coalesce(p.donation_cents, 0))::int as amount_cents
        from public.invoice_deliveries d
        left join public.users u on u.id = d.user_id
        left join public.verification_payments p on p.id = d.payment_id
       where ${onlyFailed ? sql`d.status <> 'delivered'` : sql`true`}
       order by d.updated_at desc
       limit 100
    `) as Row[];
    return rows as unknown as DeliveryRow[];
  } catch (error) {
    console.error("[admin] aflevermonitor kon niet worden gelezen", error);
    return [];
  }
}

/** Draait de volledige factuur-/mailketen opnieuw voor één betaling. */
export async function retryDelivery(paymentId: string): Promise<{ ok: boolean; message: string }> {
  const rows = (await sql`
    select id, user_id, tier, provider, reference_code, created_at,
           amount_cents, donation_cents, donation_plan
      from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return { ok: false, message: "Betaling niet gevonden." };

  const baseCents = Math.max(0, Number(payment["amount_cents"] ?? 0));
  const donationCents = Math.max(0, Number(payment["donation_cents"] ?? 0));
  const isRenewal = baseCents === 0 && donationCents > 0;
  const lines = isRenewal
    ? [{ label: "Terugkerende bijdrage", amountCents: donationCents }]
    : [
        {
          label: `ROUT verificatie — ${(payment["tier"] as string) ?? "standaard"}`,
          amountCents: baseCents,
        },
        ...(donationCents > 0
          ? [{ label: "Vrijwillige bijdrage", amountCents: donationCents }]
          : []),
      ];

  const { deliverPaymentInvoice } = await import("./invoice-delivery.server");
  const result = await deliverPaymentInvoice({
    paymentId: payment["id"] as string,
    userId: payment["user_id"] as string,
    sequenceAt: String(payment["created_at"] ?? new Date().toISOString()),
    lines,
    totalCents: baseCents + donationCents,
    paymentMethod: (payment["provider"] as string | null) ?? "card",
    reference: (payment["reference_code"] as string | null) ?? "",
    template: isRenewal ? "subscription_renewed" : "payment_succeeded",
  });

  return {
    ok: result.emailed,
    message: result.emailed
      ? `Factuur ${result.invoiceNumber} opnieuw verstuurd${result.attached ? " met PDF" : " zonder PDF"}.`
      : `Verzenden mislukte opnieuw (${result.invoiceNumber}).`,
  };
}
