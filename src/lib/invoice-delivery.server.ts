/**
 * Eén gedeelde afhandelingsketen voor élke geslaagde betaling.
 *
 * Verificatie, losse bijdrage én terugkerende donatie lopen door exact
 * dezelfde stappen: doorlopend factuurnummer, PDF opbouwen (met herkansing) en
 * de bevestigingsmail met bijlage via Brevo. Zo kan geen enkel betaaltype de
 * facturatie omzeilen, en wordt elke hapering luid gelogd in plaats van stil
 * te mislukken.
 */
import { sql } from "@/lib/neon";
import { withRetry } from "./verification.server";

type Row = Record<string, unknown>;

export interface InvoiceDeliveryInput {
  paymentId: string;
  userId: string;
  /** Peilmoment voor de doorlopende nummering (meestal `created_at`). */
  sequenceAt: string;
  lines: { label: string; amountCents: number }[];
  totalCents: number;
  paymentMethod: string;
  reference: string;
  /** Brevo-notificatiesjabloon voor dit betaaltype. */
  template: "payment_succeeded" | "subscription_renewed";
  extraParams?: Record<string, unknown>;
}

export interface InvoiceDeliveryResult {
  invoiceNumber: string;
  attached: boolean;
  emailed: boolean;
}

/** Admin-waarschuwing bij een definitieve factuur- of mailstoring. */
async function alertAdmin(params: {
  FAILED_TEMPLATE_ID: number | string;
  USED_FALLBACK_ID: number | string;
  RECIPIENT_EMAIL: string;
  REASON: string;
}): Promise<void> {
  try {
    const { notifyAdminOfFallback } = await import("@/emails/send.server");
    notifyAdminOfFallback(params);
  } catch (error) {
    console.error("[invoice] admin-alert kon niet worden verstuurd", error);
  }
}

/**
 * Doorlopend factuurnummer: positie van deze betaling binnen alle betaalde
 * betalingen, chronologisch. Geen extra tabel, wel stabiel en oplopend.
 */
export async function invoiceNumberFor(sequenceAt: string): Promise<string> {
  let sequence = 1;
  try {
    const rows = (await sql`
      select count(*)::int as n from public.verification_payments
       where status = 'paid' and created_at <= ${sequenceAt}
    `) as Row[];
    sequence = Math.max(1, Number(rows[0]?.["n"] ?? 1));
  } catch (error) {
    console.error("[invoice] nummering viel terug op 1", error);
  }
  const year = new Date(sequenceAt).getUTCFullYear() || new Date().getUTCFullYear();
  return `ROUT-${year}-${String(sequence).padStart(5, "0")}`;
}

/** Bouwt de factuur, hangt hem aan de mail en verstuurt die via Brevo. */
export async function deliverPaymentInvoice(
  input: InvoiceDeliveryInput,
): Promise<InvoiceDeliveryResult> {
  const correlationId = `pay_${input.paymentId.slice(0, 8)}_${Date.now().toString(36)}`;
  const invoiceNumber = await invoiceNumberFor(input.sequenceAt);
  const totalCents = Math.max(0, input.totalCents);

  const profileRows = (await sql`
    select handle, verified_legal_name from public.profiles where id = ${input.userId} limit 1
  `) as Row[];

  // Een tijdelijke hapering mag nooit tot een mail zonder factuur leiden; lukt
  // het definitief niet, dan vertrekt de mail alsnog met een admin-alarm.
  const attachments = await withRetry(
    async () => {
      const { renderInvoicePdf } = await import("./invoice-pdf.server");
      const { dbAdmin } = await import("@/lib/db/admin.server");
      const { data: account } = await dbAdmin.auth.admin.getUserById(input.userId);
      return [
        {
          name: `${invoiceNumber}.pdf`,
          contentBase64: renderInvoicePdf({
            invoiceNumber,
            issuedAt: new Date(),
            customerEmail: account?.user?.email ?? "",
            customerName: (profileRows[0]?.["verified_legal_name"] as string | null) ?? null,
            customerUsername: (profileRows[0]?.["handle"] as string | null) ?? null,
            customerId: input.userId,
            lines: input.lines,
            totalCents,
            currency: "EUR",
            paymentMethod: input.paymentMethod,
            reference: input.reference,
          }),
        },
      ];
    },
    { label: "factuur-PDF", correlationId, attempts: 3 },
  ).catch(async (error: unknown) => {
    console.error("[invoice] factuur-PDF genereren definitief mislukt", {
      correlationId,
      invoiceNumber,
      paymentId: input.paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
    await alertAdmin({
      FAILED_TEMPLATE_ID: "invoice-pdf",
      USED_FALLBACK_ID: "mail zonder bijlage",
      RECIPIENT_EMAIL: input.userId,
      REASON: `Factuur ${invoiceNumber} kon niet worden gegenereerd: ${
        error instanceof Error ? error.message : String(error)
      } [${correlationId}]`,
    });
    return [] as { name: string; contentBase64: string }[];
  });

  let emailed = false;
  let failure: string | null = attachments.length === 0 ? "factuur-PDF mislukt" : null;
  try {
    const { notifyUser } = await import("./notifications.server");
    await withRetry(
      () =>
        notifyUser(
          input.userId,
          input.template,
          { payment_id: input.paymentId },
          {
            AMOUNT: `€${(totalCents / 100).toFixed(2)}`,
            AMOUNT_CENTS: totalCents,
            CURRENCY: "EUR",
            INVOICE_NUMBER: invoiceNumber,
            REFERENCE: input.reference,
            PAYMENT_METHOD: input.paymentMethod,
            PAID_AT: new Date().toISOString(),
            ...(input.extraParams ?? {}),
          },
          { attachments },
        ),
      { label: `Brevo ${input.template}`, correlationId, attempts: 3 },
    );
    emailed = true;
    console.info("[invoice] factuur verstuurd", {
      correlationId,
      invoiceNumber,
      paymentId: input.paymentId,
      template: input.template,
      attached: attachments.length > 0,
    });
  } catch (error) {
    // Een Brevo-storing mag de afhandeling nooit tegenhouden — wel luid loggen.
    console.error(`[invoice] Brevo ${input.template} mail definitief mislukt`, {
      correlationId,
      invoiceNumber,
      paymentId: input.paymentId,
      userId: input.userId,
      hasAttachment: attachments.length > 0,
      error: (failure = error instanceof Error ? error.message : String(error)),
    });
    await alertAdmin({
      FAILED_TEMPLATE_ID: input.template,
      USED_FALLBACK_ID: "none",
      RECIPIENT_EMAIL: input.userId,
      REASON: `Betalingsbevestiging ${invoiceNumber} kon niet worden verstuurd: ${
        error instanceof Error ? error.message : String(error)
      } [${correlationId}]`,
    });
  }

  await recordDelivery({
    paymentId: input.paymentId,
    userId: input.userId,
    invoiceNumber,
    template: input.template,
    attached: attachments.length > 0,
    emailed,
    error: failure,
  });

  return { invoiceNumber, attached: attachments.length > 0, emailed };
}

/**
 * Schrijft de afloop van één afhandeling weg zodat de adminmonitor precies
 * ziet welke betaling wél een factuur en mail kreeg — en welke opnieuw moet.
 */
export async function recordDelivery(entry: {
  paymentId: string;
  userId: string;
  invoiceNumber: string;
  template: string;
  attached: boolean;
  emailed: boolean;
  error: string | null;
}): Promise<void> {
  const status =
    entry.emailed && entry.attached ? "delivered" : entry.emailed ? "no_invoice" : "failed";
  try {
    await sql`
      insert into public.invoice_deliveries
        (payment_id, user_id, invoice_number, template, attached, emailed, status, error, attempts)
      values (${entry.paymentId}, ${entry.userId}, ${entry.invoiceNumber}, ${entry.template},
              ${entry.attached}, ${entry.emailed}, ${status}, ${entry.error}, 1)
      on conflict (payment_id) do update
        set invoice_number = excluded.invoice_number,
            template = excluded.template,
            attached = excluded.attached,
            emailed = excluded.emailed,
            status = excluded.status,
            error = excluded.error,
            attempts = public.invoice_deliveries.attempts + 1,
            updated_at = now()
    `;
  } catch (error) {
    console.error("[invoice] afleverstatus kon niet worden vastgelegd", error);
  }
}
