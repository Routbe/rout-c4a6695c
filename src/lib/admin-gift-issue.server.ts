import { sql } from "./neon";
import { GIFT_MAIL_RULE, giftDiscount, requireGiftActivation, type GiftIssueInput, type StoredGiftRecipient } from "./gift-issue-rules";
import { createGiftOrder, markGiftCardPaid } from "./gift-cards.server";
import { generatePromoCode } from "./promo-admin.server";
import { sendMail } from "@/emails/send.server";
import { logPromoEvent } from "./promo.server";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
const copy = {
  nl: { subject: "Je persoonlijke ROUT-cadeau", code: "Code", value: "Waarde", expiry: "Geldig tot", uses: "Gebruikslimiet", cap: "Maximumkorting", link: "Gebruik je code" },
  en: { subject: "Your personal ROUT gift", code: "Code", value: "Value", expiry: "Valid until", uses: "Usage limit", cap: "Maximum discount", link: "Use your code" },
  fr: { subject: "Votre cadeau ROUT personnel", code: "Code", value: "Valeur", expiry: "Valable jusqu’au", uses: "Limite d’utilisation", cap: "Réduction maximale", link: "Utiliser votre code" },
  de: { subject: "Dein persönliches ROUT-Geschenk", code: "Code", value: "Wert", expiry: "Gültig bis", uses: "Nutzungslimit", cap: "Maximaler Rabatt", link: "Code verwenden" },
};

export async function findGiftRecipients(query: string) {
  const q = query.replace(/^@+/, "").trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await sql`select p.id, p.username, p.display_name from public.profiles p
    where lower(p.username) like ${`%${q.replace(/[%_]/g, "")}%`} and coalesce(p.is_banned, false) = false
    order by (lower(p.username) = ${q}) desc, p.username limit 10`;
  return rows.map(r => ({ userId: String(r.id), username: String(r.username), name: String(r.display_name ?? "") }));
}

async function recipientInput(input: GiftIssueInput): Promise<GiftIssueInput> {
  if (input.recipientEmail || !input.recipientUserId) return input;
  const rows = await sql`select u.email from public.users u join public.profiles p on p.id = u.id
    where u.id = ${input.recipientUserId} and coalesce(u.is_disabled, false) = false
      and coalesce(p.is_banned, false) = false limit 1`;
  const email = rows[0]?.email;
  if (typeof email !== "string" || !email) throw new Error("gift_recipient_unavailable");
  return { ...input, recipientEmail: email };
}

export async function sendAdminGift(adminId: string, code: string, input: GiftIssueInput) {
  if (!input.sendEmail) return { emailed: false, delivery: "not_requested" as const };
  // Email addresses found through account lookup never cross the server boundary.
  try { input = await recipientInput(input); } catch { return { emailed: false, delivery: "failed" as const }; }
  if (!input.recipientEmail) return { emailed: false, delivery: "failed" as const };
  // Per-admin hourly cap, fail-closed: a broken counter never opens unlimited mail.
  const { hitRateLimit } = await import("./rate-limit-db.server");
  const limit = await hitRateLimit("admin-gift-mail", adminId, GIFT_MAIL_RULE, { failClosed: true });
  if (!limit.ok) return { emailed: false, delivery: "failed" as const };
  const c = copy[input.language];
  const d = giftDiscount(input);
  const money = (cents: number) => new Intl.NumberFormat(input.language, { style: "currency", currency: "EUR" }).format(cents / 100);
  const value = input.kind === "fixed" ? money(d.amountOffCents) : `${d.percentOff}%`;
  const html = `<h1>${c.subject}</h1>${input.recipientName ? `<p>${escape(input.recipientName)}</p>` : ""}
    <p>${c.value}: <strong>${value}</strong></p><p>${c.code}: <strong>${escape(code)}</strong></p>
    ${input.message ? `<blockquote>${escape(input.message)}</blockquote>` : ""}
    <p>${c.uses}: ${input.maxRedemptions}</p>
    ${input.expiresAt ? `<p>${c.expiry}: ${escape(new Date(input.expiresAt).toLocaleDateString(input.language))}</p>` : ""}
    ${d.maxDiscountCents ? `<p>${c.cap}: ${money(d.maxDiscountCents)}</p>` : ""}
    <p><a href="https://rout.be/verify">${c.link}</a></p>`;
  try {
    const result = await sendMail({ to: input.recipientEmail, subject: c.subject, html, htmlFirst: true, language: input.language, tags: ["personal-gift"] });
    if (result.sent) await logPromoEvent(code, "sent_email", "personal gift accepted by mail provider");
    return { emailed: result.sent, delivery: result.sent ? "accepted" as const : "failed" as const };
  } catch {
    return { emailed: false, delivery: "failed" as const };
  }
}

export async function issueAdminGift(adminId: string, purchaserEmail: string, input: GiftIssueInput) {
  input = await recipientInput(input);
  const discount = giftDiscount(input);
  let code: string;
  if (input.kind === "fixed") {
    const order = await createGiftOrder({ amountCents: discount.amountOffCents, purchaserUserId: adminId, purchaserEmail,
      purchaserName: "ROUT", recipientEmail: input.recipientEmail || null, recipientName: input.recipientName || null, message: input.message || null });
    requireGiftActivation(await markGiftCardPaid({ giftId: order.id, reference: `admin:${adminId}`, deliver: false,
      maxRedemptions: input.maxRedemptions, expiresAt: input.expiresAt }));
    code = order.code;
  } else {
    code = generatePromoCode();
    await sql`insert into public.promo_codes (code, label, percent_off, amount_off_cents, max_discount_cents, max_redemptions, expires_at, active)
      values (${code}, ${`${discount.percentOff}%`}, ${discount.percentOff}, 0, ${discount.maxDiscountCents}, ${input.maxRedemptions}, ${input.expiresAt ?? null}::timestamptz, true)`;
  }
  return { code, ...await sendAdminGift(adminId, code, input) };
}

/** Recipient stored with a fixed-value gift card, if any (percentage gifts store none). */
export async function storedGiftRecipient(code: string): Promise<StoredGiftRecipient | null> {
  const rows = await sql`select recipient_email, recipient_name, message from public.gift_cards where code = ${code} limit 1`;
  const row = rows[0];
  if (!row) return null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { recipientEmail: str(row.recipient_email), recipientName: str(row.recipient_name), message: str(row.message) };
}

/** Audit note describing the mail target without revealing looked-up addresses. */
export function giftMailAuditNote(input: GiftIssueInput, emailed: boolean): string | null {
  if (!input.sendEmail) return null;
  const target = input.recipientUserId ? "account" : `typed @${(input.recipientEmail ?? "").split("@")[1] ?? "?"}`;
  return `mail ${emailed ? "accepted" : "not sent"} → ${target}`;
}