/**
 * Server-only cadeaubonlogica: order aanmaken, Stripe-checkout starten, na
 * betaling de bon activeren (als promocode), factuur + digitale bon mailen en
 * de publieke 3D-weergave van veilige velden voorzien.
 */
import { sql } from "@/lib/neon";
import {
  clampGiftAmount,
  generateGiftCode,
  giftDesign,
  normalizeGiftCode,
  shippingIsFree,
  euro,
  type PublicGiftCard,
} from "./gift-cards";

type Row = Record<string, unknown>;

const str = (row: Row, key: string): string | null => {
  const v = row[key];
  return typeof v === "string" ? v : null;
};

export interface GiftOrderInput {
  amountCents: number;
  purchaserEmail: string;
  purchaserName?: string | null;
  purchaserUserId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  message?: string | null;
  design?: string | null;
  physicalDelivery?: boolean;
  ship?: {
    name?: string | null;
    line1?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
}

/** Unieke code, met een paar herkansingen bij een (zeldzame) botsing. */
async function uniqueGiftCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateGiftCode();
    const rows = (await sql`select 1 from public.gift_cards where code = ${code}`) as Row[];
    if (rows.length === 0) return code;
  }
  throw new Error("gift_code_generation_failed");
}

export async function createGiftOrder(
  input: GiftOrderInput,
): Promise<{ id: string; code: string }> {
  const amount = clampGiftAmount(input.amountCents);
  const physical = Boolean(input.physicalDelivery);
  const country = (input.ship?.country ?? "BE").trim().toUpperCase();
  if (physical && !shippingIsFree(country)) throw new Error("shipping_country_unsupported");
  if (physical && (!input.ship?.line1 || !input.ship?.postalCode || !input.ship?.city)) {
    throw new Error("shipping_address_incomplete");
  }
  const code = await uniqueGiftCode();
  const design = giftDesign(input.design).id;

  const rows = (await sql`
    insert into public.gift_cards (
      code, amount_cents, purchaser_user_id, purchaser_email, purchaser_name,
      recipient_email, recipient_name, message, design,
      physical_delivery, ship_name, ship_line1, ship_postal_code, ship_city, ship_country
    ) values (
      ${code}, ${amount}, ${input.purchaserUserId ?? null}, ${input.purchaserEmail},
      ${input.purchaserName ?? null}, ${input.recipientEmail ?? null}, ${input.recipientName ?? null},
      ${input.message ?? null}, ${design},
      ${physical}, ${input.ship?.name ?? null}, ${input.ship?.line1 ?? null},
      ${input.ship?.postalCode ?? null}, ${input.ship?.city ?? null}, ${physical ? country : null}
    )
    returning id, code
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("gift_order_failed");
  return { id: String(row["id"]), code: String(row["code"]) };
}

/** Stripe Checkout voor één cadeaubon. Metadata koppelt de webhook terug. */
export async function startGiftCheckout(opts: {
  giftId: string;
  amountCents: number;
  email: string;
  origin: string;
}): Promise<string> {
  const { stripeKey } = await import("./verification.server");
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");

  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${opts.origin}/gift?status=success&id=${opts.giftId}`,
    cancel_url: `${opts.origin}/gift?status=cancelled`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(opts.amountCents),
    "line_items[0][price_data][product_data][name]": `ROUT cadeaubon ${euro(opts.amountCents)}`,
    "metadata[kind]": "gift_card",
    "metadata[gift_card_id]": opts.giftId,
    "payment_intent_data[metadata][kind]": "gift_card",
    "payment_intent_data[metadata][gift_card_id]": opts.giftId,
    customer_email: opts.email,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) throw new Error(json.error?.message ?? "stripe_checkout_failed");
  return json.url;
}

/**
 * Activeert een betaalde bon: idempotent (een tweede webhook doet niets meer),
 * zet de code klaar als eenmalige promocode, en levert factuur + bon af.
 */
export async function markGiftCardPaid(opts: {
  giftId: string;
  reference?: string | null;
  deliver?: boolean;
  maxRedemptions?: number;
  expiresAt?: string | null;
}): Promise<"activated" | "duplicate" | "not_found"> {
  const results = await sql.transaction([
    sql`select id from public.gift_cards where id = ${opts.giftId} for update`,
    sql`with activated as (
    update public.gift_cards
       set status = 'paid',
           paid_at = now(),
           fulfilment_status = case
             when physical_delivery then 'pending_print'
             else fulfilment_status
           end,
           stripe_reference = coalesce(${opts.reference ?? null}, stripe_reference),
           updated_at = now()
     where id = ${opts.giftId}
       and (status = 'pending' or (status = 'paid' and not exists (
         select 1 from public.promo_codes where code = public.gift_cards.code
       )))
    returning *
    ), promo as (
      insert into public.promo_codes (code, label, percent_off, amount_off_cents, max_redemptions, expires_at, active)
      select code, 'Cadeaubon', 0, amount_cents, ${opts.maxRedemptions ?? 1}, ${opts.expiresAt ?? null}::timestamptz, true from activated
      on conflict (code) do nothing
      returning code
    ) select activated.* from activated
  `]);
  const row = results[1]?.[0];
  if (!row) {
    const exists =
      (await sql`select status from public.gift_cards where id = ${opts.giftId}`) as Row[];
    return exists.length > 0 ? "duplicate" : "not_found";
  }

  if (opts.deliver !== false) await deliverGiftCard(row).catch((error) => {
    console.error("[gift] bezorging mislukt", { giftId: opts.giftId, error });
  });
  return "activated";
}

/** Factuur naar de koper, digitale bon (PDF + 3D-link) naar de ontvanger. */
export async function deliverGiftCard(row: Row): Promise<void> {
  const { sendMail } = await import("@/emails/send.server");
  const { renderInvoicePdf } = await import("./invoice-pdf.server");
  const { renderGiftCardPdf } = await import("./gift-card-pdf.server");
  const { invoiceNumberFor } = await import("./invoice-delivery.server");

  const code = String(row["code"]);
  const amount = Number(row["amount_cents"] ?? 0);
  const purchaserEmail = str(row, "purchaser_email") ?? "";
  const recipientEmail = str(row, "recipient_email");
  const physical = row["physical_delivery"] === true;
  const paidAt = str(row, "paid_at") ?? new Date().toISOString();
  const origin = process.env["PUBLIC_ORIGIN"] ?? "https://rout.be";
  const viewUrl = `${origin}/gift/${code}`;

  const invoiceNumber = await invoiceNumberFor(paidAt).catch(() => `GIFT-${code.slice(-8)}`);
  const invoiceBase64 = renderInvoicePdf({
    invoiceNumber,
    issuedAt: new Date(paidAt),
    customerEmail: purchaserEmail,
    customerName: str(row, "purchaser_name"),
    lines: [{ label: `ROUT cadeaubon ${euro(amount)}`, amountCents: amount }],
    totalCents: amount,
    paymentMethod: "Stripe",
    reference: code,
  });
  const giftBase64 = renderGiftCardPdf({
    code,
    amountCents: amount,
    design: giftDesign(str(row, "design")).id,
    recipientName: str(row, "recipient_name"),
    purchaserName: str(row, "purchaser_name"),
    message: str(row, "message"),
    viewUrl,
  });

  let recipientSent = !recipientEmail;
  if (recipientEmail) {
    const result = await sendMail({
      to: recipientEmail,
      subject: `Je kreeg een ROUT-cadeaubon van ${euro(amount)}`,
      html: `<p>${escapeHtml(str(row, "purchaser_name") ?? "Iemand")} stuurde je een ROUT-cadeaubon van ${euro(amount)}.</p>
        ${str(row, "message") ? `<blockquote>${escapeHtml(str(row, "message") ?? "")}</blockquote>` : ""}
        <p>Code: <strong>${escapeHtml(code)}</strong></p>
        <p><a href="${viewUrl}">Bekijk je bon</a></p>`,
      attachments: [{ name: `cadeaubon-${code}.pdf`, contentBase64: giftBase64 }],
    });
    recipientSent = result.sent;
  }

  let purchaserSent = !purchaserEmail;
  if (purchaserEmail) {
    const result = await sendMail({
      to: purchaserEmail,
      subject: `Je ROUT-cadeaubon (${euro(amount)}) is klaar`,
      html: `<p>Bedankt! De cadeaubon <strong>${code}</strong> ter waarde van ${euro(amount)} is geactiveerd.</p>
        <p>Digitale versie: <a href="${viewUrl}">${viewUrl}</a></p>
        ${recipientEmail ? `<p>${recipientSent ? "De e-mail voor de ontvanger is aangeboden aan de maildienst." : "De e-mail voor de ontvanger kon nog niet worden verstuurd."}</p>` : ""}
        ${physical ? "<p>De fysieke bon versturen we gratis binnen België.</p>" : ""}
        <p>Je factuur ${invoiceNumber} zit in bijlage.</p>`,
      attachments: [
        { name: `${invoiceNumber}.pdf`, contentBase64: invoiceBase64 },
        { name: `cadeaubon-${code}.pdf`, contentBase64: giftBase64 },
      ],
    });
    purchaserSent = result.sent;
  }

  if (!recipientSent || !purchaserSent) return;

  await sql`
    update public.gift_cards
       set status = 'delivered', delivered_at = now(), invoice_number = ${invoiceNumber}, updated_at = now()
     where id = ${String(row["id"])}
  `;
}

function toPublic(row: Row, redeemed: boolean): PublicGiftCard {
  return {
    code: String(row["code"]),
    amountCents: Number(row["amount_cents"] ?? 0),
    currency: str(row, "currency") ?? "EUR",
    design: giftDesign(str(row, "design")).id,
    recipientName: str(row, "recipient_name"),
    purchaserName: str(row, "purchaser_name"),
    message: str(row, "message"),
    status: (str(row, "status") ?? "pending") as PublicGiftCard["status"],
    fulfilmentStatus: (str(row, "fulfilment_status") ??
      "not_applicable") as PublicGiftCard["fulfilmentStatus"],
    trackingCode: str(row, "tracking_code"),
    redeemed,
    createdAt: str(row, "created_at") ?? new Date().toISOString(),
  };
}

/** Publieke weergave: alleen betaalde/afgeleverde bonnen, nooit koperse-mail. */
export async function fetchPublicGiftCard(codeInput: string): Promise<PublicGiftCard | null> {
  const code = normalizeGiftCode(codeInput);
  const rows = (await sql`
    select * from public.gift_cards where code = ${code} and status in ('paid', 'delivered')
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  const promo = (await sql`
    select redeemed_count from public.promo_codes where code = ${code}
  `) as Row[];
  const redeemed = Number(promo[0]?.["redeemed_count"] ?? 0) > 0;
  return toPublic(row, redeemed);
}

/** Bonnen die dit lid zelf kocht. */
export async function fetchMyGiftCards(userId: string): Promise<PublicGiftCard[]> {
  const rows = (await sql`
    select g.*, coalesce(p.redeemed_count, 0) as redeemed_count
      from public.gift_cards g
      left join public.promo_codes p on p.code = g.code
     where g.purchaser_user_id = ${userId}
     order by g.created_at desc
     limit 50
  `) as Row[];
  return rows.map((row) => toPublic(row, Number(row["redeemed_count"] ?? 0) > 0));
}


function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
