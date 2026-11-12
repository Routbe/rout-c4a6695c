/**
 * Admin-side promo code creation + invitation e-mail.
 *
 * Server-only: the `promo_codes` table is unreachable from the client (RLS
 * grants `service_role` only), so creation and lookup always run here.
 */
import { sql } from "@/lib/neon";
import { sendMail } from "@/emails/send.server";
import { asEmailLanguage, type EmailLanguage } from "@/emails/template-ids";
import { isPromoAvailable, logPromoEvent, normalizePromoCode } from "./promo.server";

export interface CreatePromoInput {
  code?: string | null;
  label?: string | null;
  percentOff?: number | null;
  amountOffCents?: number | null;
  /** Plafond op de procentuele korting (bijv. 50% met max €10). */
  maxDiscountCents?: number | null;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  email?: string | null;
  /** Optioneel: stuur de code ook per SMS. */
  phone?: string | null;
  language?: string | null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Readable, unambiguous 10-character code, e.g. `ROUT-7KQ4PX`. */
export function generatePromoCode(prefix = "ROUT"): string {
  let body = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${body}`;
}

interface Copy {
  subject: string;
  intro: string;
  howto: string;
  validity: (until: string) => string;
  outro: string;
}

const COPY: Record<EmailLanguage, Copy> = {
  nl: {
    subject: "Je persoonlijke ROUT-promocode",
    intro: "Je hebt een persoonlijke kortingscode gekregen voor ROUT.",
    howto: "Vul deze code in bij het afrekenen om je korting toe te passen:",
    validity: (until) => `Geldig tot ${until}.`,
    outro: "Vragen? Antwoord gewoon op deze e-mail.",
  },
  en: {
    subject: "Your personal ROUT promo code",
    intro: "You have received a personal discount code for ROUT.",
    howto: "Enter this code at checkout to apply your discount:",
    validity: (until) => `Valid until ${until}.`,
    outro: "Questions? Just reply to this e-mail.",
  },
  fr: {
    subject: "Votre code promo ROUT personnel",
    intro: "Vous avez reçu un code de réduction personnel pour ROUT.",
    howto: "Saisissez ce code lors du paiement pour appliquer votre réduction :",
    validity: (until) => `Valable jusqu'au ${until}.`,
    outro: "Des questions ? Répondez simplement à cet e-mail.",
  },
  de: {
    subject: "Dein persönlicher ROUT-Promocode",
    intro: "Du hast einen persönlichen Rabattcode für ROUT erhalten.",
    howto: "Gib diesen Code beim Bezahlen ein, um deinen Rabatt zu nutzen:",
    validity: (until) => `Gültig bis ${until}.`,
    outro: "Fragen? Antworte einfach auf diese E-Mail.",
  },
  es: {
    subject: "Tu código promocional de ROUT",
    intro: "Has recibido un código de descuento personal para ROUT.",
    howto: "Introduce este código al pagar para aplicar tu descuento:",
    validity: (until) => `Válido hasta ${until}.`,
    outro: "¿Preguntas? Responde a este correo.",
  },
  pt: {
    subject: "O teu código promocional ROUT",
    intro: "Recebeste um código de desconto pessoal para o ROUT.",
    howto: "Introduz este código no checkout para aplicar o desconto:",
    validity: (until) => `Válido até ${until}.`,
    outro: "Dúvidas? Basta responder a este e-mail.",
  },
  it: {
    subject: "Il tuo codice promozionale ROUT",
    intro: "Hai ricevuto un codice sconto personale per ROUT.",
    howto: "Inserisci questo codice al momento del pagamento per applicare lo sconto:",
    validity: (until) => `Valido fino al ${until}.`,
    outro: "Domande? Rispondi semplicemente a questa e-mail.",
  },
  pl: {
    subject: "Twój kod promocyjny ROUT",
    intro: "Otrzymałeś osobisty kod rabatowy do ROUT.",
    howto: "Wpisz ten kod przy płatności, aby uzyskać zniżkę:",
    validity: (until) => `Ważny do ${until}.`,
    outro: "Pytania? Odpowiedz na tę wiadomość.",
  },
  zh: {
    subject: "您的 ROUT 优惠码",
    intro: "您已获得 ROUT 的专属折扣码。",
    howto: "结账时输入此代码即可享受折扣：",
    validity: (until) => `有效期至 ${until}。`,
    outro: "有疑问？直接回复此邮件即可。",
  },
};

function discountLabel(
  percentOff: number,
  amountOffCents: number,
  language: EmailLanguage,
): string {
  if (percentOff > 0) return `${percentOff}%`;
  return new Intl.NumberFormat(language === "zh" ? "en" : language, {
    style: "currency",
    currency: "EUR",
  }).format(amountOffCents / 100);
}

function renderHtml(
  language: EmailLanguage,
  code: string,
  discount: string,
  expires: string | null,
): string {
  const copy = COPY[language];
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;padding:28px 24px">
    <h1 style="font-size:20px;margin:0 0 12px">${copy.subject}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 8px">${copy.intro}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${copy.howto}</p>
    <p style="font-size:22px;font-weight:700;letter-spacing:2px;margin:0 0 8px">${code}</p>
    <p style="font-size:14px;margin:0 0 12px">${discount}</p>
    ${expires ? `<p style="font-size:13px;color:#555;margin:0 0 12px">${copy.validity(expires)}</p>` : ""}
    <p style="font-size:13px;color:#555;margin:16px 0 0">${copy.outro}</p>
  </div></body></html>`;
}

export interface CreatePromoResult {
  ok: boolean;
  code: string;
  emailed: boolean;
  texted?: boolean;
  error?: string;
}

/** Korte SMS-tekst met de ingevulde promocode. */
function smsText(
  language: EmailLanguage,
  code: string,
  discount: string,
  expires: string | null,
): string {
  const copy = COPY[language];
  return [copy.intro, `${code} (${discount})`, expires ? copy.validity(expires) : null]
    .filter(Boolean)
    .join(" ");
}

/** Creates (or upserts) the promo code and optionally mails it to a customer. */
export async function createPromoAndInvite(input: CreatePromoInput): Promise<CreatePromoResult> {
  const code = normalizePromoCode(input.code?.trim() || generatePromoCode());
  if (code.length < 4) return { ok: false, code, emailed: false, error: "Code is te kort." };

  const percentOff = Math.min(100, Math.max(0, Math.round(input.percentOff ?? 0)));
  const amountOffCents = Math.max(0, Math.round(input.amountOffCents ?? 0));
  if (percentOff === 0 && amountOffCents === 0) {
    return { ok: false, code, emailed: false, error: "Geef een percentage of een vast bedrag op." };
  }

  const maxRedemptions =
    input.maxRedemptions && input.maxRedemptions > 0 ? Math.round(input.maxRedemptions) : null;
  const maxDiscountCents =
    percentOff > 0 && input.maxDiscountCents && input.maxDiscountCents > 0
      ? Math.round(input.maxDiscountCents)
      : null;
  const expiresAt = input.expiresAt && input.expiresAt.length > 0 ? input.expiresAt : null;
  const label =
    input.label?.trim() ||
    (percentOff > 0
      ? `${percentOff}% korting${maxDiscountCents ? ` (max €${(maxDiscountCents / 100).toFixed(2)})` : ""}`
      : `€${(amountOffCents / 100).toFixed(2)} korting`);

  await sql`
    insert into public.promo_codes
      (code, label, percent_off, amount_off_cents, max_discount_cents,
       max_redemptions, expires_at, active)
    values
      (${code}, ${label}, ${percentOff}, ${amountOffCents}, ${maxDiscountCents},
       ${maxRedemptions}, ${expiresAt}, true)
    on conflict (code) do update set
      label = excluded.label,
      percent_off = excluded.percent_off,
      amount_off_cents = excluded.amount_off_cents,
      max_discount_cents = excluded.max_discount_cents,
      max_redemptions = excluded.max_redemptions,
      expires_at = excluded.expires_at,
      active = true,
      updated_at = now()
  `;

  await logPromoEvent(code, "created", label);

  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  if (!email && !phone) return { ok: true, code, emailed: false, texted: false };

  // Nooit een code versturen die al op of verlopen is: eerst de beschikbaarheid
  // opnieuw uit de database halen, dan pas Brevo aanspreken.
  if (!(await isPromoAvailable(code))) {
    return {
      ok: false,
      code,
      emailed: false,
      texted: false,
      error: "Deze code is niet meer geldig (verlopen of al volledig gebruikt).",
    };
  }

  const language = asEmailLanguage(input.language);
  const discount = discountLabel(percentOff, amountOffCents, language);
  const expiresLabel = expiresAt
    ? new Intl.DateTimeFormat(language === "zh" ? "en" : language, { dateStyle: "long" }).format(
        new Date(expiresAt),
      )
    : null;

  const errors: string[] = [];
  let texted = false;
  if (phone) {
    const { sendSms } = await import("./sms.server");
    const sms = await sendSms({
      to: phone,
      text: smsText(language, code, discount, expiresLabel),
      tag: "promo-invite",
    });
    texted = sms.sent;
    if (sms.sent) await logPromoEvent(code, "sent_sms", phone);
    if (sms.error) errors.push(sms.error);
  }

  if (!email) {
    return { ok: true, code, emailed: false, texted, ...(errors[0] ? { error: errors[0] } : {}) };
  }

  const result = await sendMail({
    to: email,
    category: "invite",
    language,
    subject: COPY[language].subject,
    html: renderHtml(language, code, discount, expiresLabel),
    params: {
      PROMO_CODE: code,
      DISCOUNT: discount,
      EXPIRES_AT: expiresLabel ?? "",
      LANGUAGE: language,
    },
    tags: ["promo-invite"],
  });

  if (result.sent) await logPromoEvent(code, "sent_email", email);
  if (result.error) errors.push(result.error);
  return {
    ok: true,
    code,
    emailed: result.sent,
    texted,
    ...(errors[0] ? { error: errors.join(" | ") } : {}),
  };
}

/** Most recently created promo codes, for the admin overview table. */
export async function listPromoCodes(limit = 25) {
  type Row = {
    code: string;
    label: string | null;
    percent_off: number;
    amount_off_cents: number;
    max_redemptions: number | null;
    redeemed_count: number;
    active: boolean;
    expires_at: string | null;
    created_at: string;
  };
  const rows = (await sql`
    select code, label, percent_off, amount_off_cents, max_redemptions,
           redeemed_count, active, expires_at, created_at
      from public.promo_codes
     order by created_at desc
     limit ${limit}
  `) as Row[];
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    percentOff: row.percent_off,
    amountOffCents: row.amount_off_cents,
    maxRedemptions: row.max_redemptions,
    redeemedCount: row.redeemed_count,
    active: row.active,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}
