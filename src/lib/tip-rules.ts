/**
 * Client-safe regels voor de steunpagina: betaalmethodes, externe links,
 * fotolimiet, sociale bron en de Stripe-sleutelcontrole. Server en UI
 * gebruiken exact dezelfde regels.
 */

export const TIP_MAX_IMAGES = 6;
export const TIP_IMAGE_MAX_PX = 2000;
export const TIP_IMAGE_MAX_BYTES = 1_500_000;

export type TipMethodId = "transfer" | "psp" | "links";
export type TipMethod = { id: TipMethodId; enabled: boolean };
export const DEFAULT_TIP_METHODS: TipMethod[] = [
  { id: "transfer", enabled: true },
  { id: "psp", enabled: true },
  { id: "links", enabled: true },
];

/** Volgorde + aan/uit; onbekende ids weg, ontbrekende achteraan toegevoegd. Overschrijving blijft altijd aan. */
export function normalizeTipMethods(raw: unknown): TipMethod[] {
  const out: TipMethod[] = [];
  if (Array.isArray(raw)) {
    for (const m of raw) {
      const id = (m as { id?: unknown })?.id;
      if ((id === "transfer" || id === "psp" || id === "links") && !out.some((o) => o.id === id)) {
        out.push({ id, enabled: id === "transfer" ? true : (m as { enabled?: unknown }).enabled !== false });
      }
    }
  }
  for (const d of DEFAULT_TIP_METHODS) if (!out.some((o) => o.id === d.id)) out.push({ ...d });
  return out;
}

export type ExternalTipKind = "buymeacoffee" | "kofi" | "paypal" | "bunq" | "patreon" | "liberapay";
export type ExternalTipLink = { kind: ExternalTipKind; value: string };

export const EXTERNAL_TIP_CATALOG: Record<ExternalTipKind, { label: string; color: string; ink: string; url: (v: string) => string; placeholder: string }> = {
  buymeacoffee: { label: "Buy Me a Coffee", color: "#FFDD00", ink: "#000000", url: (v) => `https://buymeacoffee.com/${v}`, placeholder: "gebruikersnaam" },
  kofi: { label: "Ko-fi", color: "#FF5E5B", ink: "#FFFFFF", url: (v) => `https://ko-fi.com/${v}`, placeholder: "gebruikersnaam" },
  paypal: { label: "PayPal", color: "#003087", ink: "#FFFFFF", url: (v) => `https://paypal.me/${v}`, placeholder: "paypal.me-naam" },
  bunq: { label: "bunq.me", color: "#1E1E1E", ink: "#FFFFFF", url: (v) => `https://bunq.me/${v}`, placeholder: "bunq.me-naam" },
  patreon: { label: "Patreon", color: "#000000", ink: "#FFFFFF", url: (v) => `https://www.patreon.com/${v}`, placeholder: "gebruikersnaam" },
  liberapay: { label: "Liberapay", color: "#F6C915", ink: "#1A171B", url: (v) => `https://liberapay.com/${v}`, placeholder: "gebruikersnaam" },
};

const LINK_HOSTS: Record<ExternalTipKind, RegExp> = {
  buymeacoffee: /^(?:www\.)?buymeacoffee\.com$/,
  kofi: /^(?:www\.)?ko-fi\.com$/,
  paypal: /^(?:www\.)?paypal\.me$/,
  bunq: /^bunq\.me$/,
  patreon: /^(?:www\.)?patreon\.com$/,
  liberapay: /^(?:www\.)?liberapay\.com$/,
};

/** Gebruikersnaam of volledige link → enkel de gebruikersnaam; ongeldig = null. */
export function cleanExternalValue(kind: ExternalTipKind, raw: string): string | null {
  let v = raw.trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (!LINK_HOSTS[kind].test(u.hostname.toLowerCase())) return null;
      v = u.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  v = v.replace(/^@+/, "");
  return /^[A-Za-z0-9._-]{2,40}$/.test(v) ? v : null;
}

export function normalizeExternalLinks(raw: unknown): ExternalTipLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalTipLink[] = [];
  for (const l of raw) {
    const kind = (l as { kind?: string })?.kind as ExternalTipKind;
    if (!(kind in EXTERNAL_TIP_CATALOG) || out.some((o) => o.kind === kind)) continue;
    const value = cleanExternalValue(kind, String((l as { value?: unknown }).value ?? ""));
    if (value) out.push({ kind, value });
  }
  return out.slice(0, 6);
}

export type TipSocialSource = { network: "bluesky" | "mastodon"; handle: string; mode: "latest" | "picked"; picked: string[] } | null;

const BSKY_HANDLE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const MASTO_HANDLE = /^@?[a-z0-9_]{1,30}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function normalizeSocialSource(raw: unknown): TipSocialSource {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const network = r["network"] === "mastodon" ? "mastodon" : r["network"] === "bluesky" ? "bluesky" : null;
  const handle = String(r["handle"] ?? "").trim().replace(/^@/, network === "bluesky" ? "" : "@").toLowerCase();
  if (!network) return null;
  if (network === "bluesky" ? !BSKY_HANDLE.test(handle) : !MASTO_HANDLE.test(handle)) return null;
  const picked = Array.isArray(r["picked"])
    ? (r["picked"] as unknown[]).filter((u): u is string => typeof u === "string" && /^https:\/\/[^\s"'<>]{1,500}$/.test(u)).slice(0, TIP_MAX_IMAGES)
    : [];
  return { network, handle: handle.replace(/^@/, ""), mode: r["mode"] === "picked" ? "picked" : "latest", picked };
}

export const STRIPE_FULL_KEY_ERROR =
  "Uit veiligheidsoverwegingen accepteren wij geen volledige secret keys. Maak een Restricted Key (rk_live_...) aan in je Stripe Dashboard met enkel 'Write' permissies voor PaymentIntents.";

/** Enkel beperkte Stripe-sleutels (rk_live_/rk_test_). Volledige sk_-sleutels worden altijd geweigerd. */
export function checkStripeKey(raw: string): { ok: true } | { ok: false; message: string } {
  const key = raw.trim();
  if (/^sk_(live|test)_/.test(key)) return { ok: false, message: STRIPE_FULL_KEY_ERROR };
  if (!/^rk_(live|test)_[A-Za-z0-9]{16,}$/.test(key)) return { ok: false, message: "Dit lijkt geen geldige Stripe Restricted Key (rk_live_…)." };
  return { ok: true };
}
