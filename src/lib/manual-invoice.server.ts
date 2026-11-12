/**
 * Zelf een factuur of document opmaken en naar het lid mailen.
 *
 * Twee wegen, één keten: ofwel bouwen we een PDF uit de ingevulde regels,
 * ofwel gebruiken we het bestand dat het lid zelf uploadt. In beide gevallen
 * gaat het document als bijlage naar het e-mailadres van het account.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export interface ManualInvoiceInput {
  title: string;
  lines: { label: string; amountCents: number }[];
  note: string | null;
  /** Optioneel eigen bestand (base64, zonder data-URL-prefix). */
  fileBase64: string | null;
  fileName: string | null;
}

export interface ManualInvoiceResult {
  ok: boolean;
  emailed: boolean;
  filename: string | null;
  message?: string;
}

/** E-mailadres + naam van het lid, uit de eigen database. */
async function recipientOf(userId: string) {
  const rows = (await sql`
    select u.email,
           coalesce(nullif(trim(p.verified_legal_name), ''), p.display_name, p.username) as name,
           p.username
      from public.users u
      left join public.profiles p on p.id = u.id
     where u.id = ${userId}
     limit 1
  `) as Row[];
  const row = rows[0];
  return {
    email: (row?.["email"] as string | null) ?? null,
    name: (row?.["name"] as string | null) ?? null,
    username: (row?.["username"] as string | null) ?? null,
  };
}

export async function createAndSendManualInvoice(
  userId: string,
  input: ManualInvoiceInput,
): Promise<ManualInvoiceResult> {
  const recipient = await recipientOf(userId);
  if (!recipient.email) {
    return { ok: false, emailed: false, filename: null, message: "geen_emailadres" };
  }

  const total = input.lines.reduce((sum, line) => sum + line.amountCents, 0);
  let filename: string;
  let base64: string;

  if (input.fileBase64) {
    filename = (input.fileName || "document.pdf").replace(/[^\w.\-]/g, "_").slice(0, 60);
    base64 = input.fileBase64;
  } else {
    const { renderInvoicePdf } = await import("./invoice-pdf.server");
    const { invoiceNumberFor } = await import("./invoice-delivery.server");
    const issuedAt = new Date();
    const invoiceNumber = await invoiceNumberFor(issuedAt.toISOString());
    filename = `${invoiceNumber}.pdf`;
    base64 = renderInvoicePdf({
      invoiceNumber,
      issuedAt,
      customerEmail: recipient.email,
      customerName: recipient.name,
      customerUsername: recipient.username,
      customerId: userId,
      lines: input.lines.length > 0 ? input.lines : [{ label: input.title, amountCents: 0 }],
      totalCents: total,
      currency: "EUR",
      paymentMethod: "manual",
      reference: invoiceNumber,
    });
  }

  const { sendMail } = await import("@/emails/send.server");
  const html = `<p>Beste ${recipient.name ?? "lid"},</p>
    <p>In bijlage vind je <strong>${input.title}</strong>${
      total > 0 ? ` ter waarde van € ${(total / 100).toFixed(2)}` : ""
    }.</p>
    ${input.note ? `<p>${input.note}</p>` : ""}
    <p>— ROUT</p>`;

  const sent = await sendMail({
    to: recipient.email,
    subject: input.title,
    html,
    attachments: [{ name: filename, contentBase64: base64 }],
  });

  return { ok: true, emailed: sent.sent, filename, ...(sent.error ? { message: sent.error } : {}) };
}
