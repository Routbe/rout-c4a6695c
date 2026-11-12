/**
 * Client-veilige regels rond cadeaubonnen: bedragen, ontwerpen, codeformaat en
 * de leveringsvoorwaarden (fysieke levering is gratis, maar alleen in België).
 */

export const GIFT_MIN_CENTS = 500;
export const GIFT_MAX_CENTS = 50_000;

export const GIFT_PRESETS = [1000, 2500, 5000, 10_000] as const;

export const GIFT_DESIGNS = [
  { id: "classic", label: "Crème klassiek", front: "#FBF9F5", ink: "#16181B", accent: "#B08968" },
  { id: "midnight", label: "Middernacht", front: "#16181B", ink: "#FBF9F5", accent: "#8B9DC3" },
  { id: "moss", label: "Mos", front: "#1F2A22", ink: "#F1F5EC", accent: "#8FBF6A" },
  { id: "blush", label: "Blush", front: "#F5E6E4", ink: "#3A2224", accent: "#C97B78" },
] as const;

export type GiftDesignId = (typeof GIFT_DESIGNS)[number]["id"];

export function giftDesign(id: string | null | undefined) {
  return GIFT_DESIGNS.find((d) => d.id === id) ?? GIFT_DESIGNS[0];
}

/** Landen waar we de fysieke bon gratis opsturen. */
export const FREE_SHIPPING_COUNTRIES = ["BE"] as const;

export function shippingIsFree(country: string | null | undefined): boolean {
  return FREE_SHIPPING_COUNTRIES.includes(
    (country ?? "").trim().toUpperCase() as (typeof FREE_SHIPPING_COUNTRIES)[number],
  );
}

/** GIFT-XXXX-XXXX — geen 0/O/1/I, dus telefonisch en handmatig foutloos. */
const GIFT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isGiftCode(value: string): boolean {
  return /^GIFT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.trim().toUpperCase());
}

export function normalizeGiftCode(value: string): string {
  const raw = value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (raw.startsWith("GIFT") && raw.length === 12) {
    return `GIFT-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }
  return value.trim().toUpperCase();
}

function secureRandom(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;
}

/** Alleen server-side gebruikt, maar hier gehouden zodat het formaat één bron heeft. */
export function generateGiftCode(random: () => number = secureRandom): string {
  const block = () =>
    Array.from(
      { length: 4 },
      () => GIFT_ALPHABET[Math.floor(random() * GIFT_ALPHABET.length)],
    ).join("");
  return `GIFT-${block()}-${block()}`;
}

export function clampGiftAmount(cents: number): number {
  const rounded = Math.round(Number.isFinite(cents) ? cents : 0);
  return Math.min(GIFT_MAX_CENTS, Math.max(GIFT_MIN_CENTS, rounded));
}

export function euro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export interface PublicGiftCard {
  code: string;
  amountCents: number;
  currency: string;
  design: string;
  recipientName: string | null;
  purchaserName: string | null;
  message: string | null;
  status: "pending" | "paid" | "delivered" | "cancelled";
  /** Alleen voor fysieke bonnen: pending_print → packaged → shipped. */
  fulfilmentStatus: "not_applicable" | "pending_print" | "packaged" | "shipped";
  trackingCode: string | null;
  redeemed: boolean;
  createdAt: string;
}
