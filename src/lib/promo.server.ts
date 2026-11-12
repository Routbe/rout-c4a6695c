import type { PromoDiscount } from "./checkout-pricing";
import { sql } from "@/lib/neon";

/**
 * Promocodes (server-only), opgeslagen in `public.promo_codes`.
 *
 * Alleen de server leest deze tabel (RLS staat enkel `service_role` toe), zodat
 * codes nooit in de client-bundle of via de Data API te vinden zijn. Een
 * optionele `PROMO_CODES`-omgevingsvariabele blijft als noodgreep bestaan voor
 * omgevingen zonder database-toegang.
 */

interface PromoDefinition {
  percentOff?: number;
  amountOffCents?: number;
  label?: string;
}

// No built-in codes: EARLYBELIEVER lives in promo_codes with a redemption cap (db/69).
const DEFAULT_CODES: Record<string, PromoDefinition> = {};

function envTable(): Record<string, PromoDefinition> {
  const raw = process.env["PROMO_CODES"];
  if (!raw) return DEFAULT_CODES;
  try {
    const parsed = JSON.parse(raw) as Record<string, PromoDefinition>;
    return parsed && typeof parsed === "object" ? parsed : DEFAULT_CODES;
  } catch {
    console.warn("[promo] PROMO_CODES is not valid JSON — falling back to the built-in codes");
    return DEFAULT_CODES;
  }
}

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function toDiscount(
  normalized: string,
  percentOffRaw: number | undefined,
  amountOffCentsRaw: number | undefined,
  labelRaw: string | undefined | null,
  maxDiscountCentsRaw?: number | null,
): PromoDiscount | null {
  const percentOff = Math.min(100, Math.max(0, Math.round(percentOffRaw ?? 0)));
  const amountOffCents = Math.max(0, Math.round(amountOffCentsRaw ?? 0));
  if (percentOff === 0 && amountOffCents === 0) return null;
  const maxDiscountCents =
    typeof maxDiscountCentsRaw === "number" && maxDiscountCentsRaw > 0
      ? Math.round(maxDiscountCentsRaw)
      : null;

  return {
    code: normalized,
    label:
      labelRaw ??
      (percentOff > 0
        ? `${percentOff}% korting${maxDiscountCents ? ` (max €${(maxDiscountCents / 100).toFixed(2)})` : ""}`
        : `€${(amountOffCents / 100).toFixed(2)} korting`),
    percentOff,
    amountOffCents,
    maxDiscountCents,
  };
}

/** Zoekt de code op in de database. Geeft `null` bij een onbekende/inactieve code. */
async function resolveFromDb(normalized: string): Promise<PromoDiscount | null> {
  type Row = {
    percent_off: number;
    amount_off_cents: number;
    label: string | null;
    max_discount_cents: number | null;
  };
  const rows = (await sql`
    select percent_off, amount_off_cents, label, max_discount_cents
      from public.promo_codes
     where code = ${normalized}
       and active = true
       and (expires_at is null or expires_at > now())
       and (max_redemptions is null or redeemed_count < max_redemptions)
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  return toDiscount(
    normalized,
    row.percent_off,
    row.amount_off_cents,
    row.label,
    row.max_discount_cents,
  );
}

/** Zoekt de code op. Geeft `null` bij een onbekende of lege code. */
export async function resolvePromo(code: string | null | undefined): Promise<PromoDiscount | null> {
  if (!code) return null;
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;

  try {
    const fromDb = await resolveFromDb(normalized);
    if (fromDb) return fromDb;
  } catch (error) {
    console.error("[promo] database lookup failed, falling back to env codes", error);
  }

  const found = envTable()[normalized];
  if (!found) return null;
  return toDiscount(normalized, found.percentOff, found.amountOffCents, found.label ?? null);
}

/** Schrijft één regel in het promo-auditspoor. Faalt nooit de flow. */
export async function logPromoEvent(
  code: string,
  event: "created" | "sent_email" | "sent_sms" | "redeemed" | "exhausted",
  detail?: string | null,
): Promise<void> {
  try {
    await sql`
      insert into public.promo_code_events (code, event, detail)
      values (${normalizePromoCode(code)}, ${event}, ${detail ?? null})
    `;
  } catch (error) {
    console.error("[promo] audit log failed", error);
  }
}

/** Is de code op dit moment nog inwisselbaar? Gebruikt vóór e-mail/SMS-verzending. */
export async function isPromoAvailable(code: string): Promise<boolean> {
  return (await resolvePromo(code)) !== null;
}

/**
 * Verhoogt de teller bij een geslaagde claim. De update is atomair: de
 * `max_redemptions`-guard zit in de WHERE, zodat twee gelijktijdige claims nooit
 * samen over het maximum gaan. Geeft `false` als de code al op was.
 */
export async function recordPromoRedemption(code: string | null | undefined): Promise<boolean> {
  if (!code) return false;
  const normalized = normalizePromoCode(code);
  try {
    const rows = (await sql`
      update public.promo_codes
         set redeemed_count = redeemed_count + 1,
             last_redeemed_at = now(),
             active = case
               when max_redemptions is not null and redeemed_count + 1 >= max_redemptions
                 then false else active end,
             updated_at = now()
       where code = ${normalized}
         and active = true
         and (expires_at is null or expires_at > now())
         and (max_redemptions is null or redeemed_count < max_redemptions)
      returning redeemed_count, max_redemptions
    `) as { redeemed_count: number; max_redemptions: number | null }[];

    const row = rows[0];
    if (!row) {
      await logPromoEvent(normalized, "exhausted", "claim geweigerd: niet meer geldig");
      return false;
    }
    await logPromoEvent(normalized, "redeemed", `gebruik #${row.redeemed_count}`);
    if (row.max_redemptions !== null && row.redeemed_count >= row.max_redemptions) {
      await logPromoEvent(normalized, "exhausted", "maximum bereikt");
    }
    return true;
  } catch (error) {
    console.error("[promo] redemption counter update failed", error);
    return false;
  }
}
