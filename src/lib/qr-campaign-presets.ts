import { z } from "zod";
import { validatedRedirectTarget } from "./security/redirect-target";

/** Deterministic, on-device QR campaign helpers: no network, no AI, no keys. */

export const qrDestinationSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((v) => v.startsWith("https://") && Boolean(validatedRedirectTarget(v)), "Vul een veilige https:// bestemming in.");

export type Utm = { source: string; medium: string };
export type QrPreset = { id: string; name: string; label: string; callToAction: string; utm: Utm };

export const QR_PRESETS: readonly QrPreset[] = [
  { id: "flyer", name: "Flyer & print", label: "Ontdek meer", callToAction: "Scan voor meer info", utm: { source: "flyer", medium: "print" } },
  { id: "poster", name: "Affiche", label: "Bekijk online", callToAction: "Scan en bekijk het online", utm: { source: "poster", medium: "print" } },
  { id: "event", name: "Evenement", label: "Schrijf je in", callToAction: "Scan en schrijf je in", utm: { source: "event", medium: "qr" } },
  { id: "promo", name: "Actie & korting", label: "Bekijk de actie", callToAction: "Scan voor je korting", utm: { source: "promo", medium: "qr" } },
  { id: "packaging", name: "Verpakking", label: "Productinfo", callToAction: "Scan voor productinfo", utm: { source: "packaging", medium: "qr" } },
  { id: "feedback", name: "Feedback", label: "Geef je mening", callToAction: "Scan en laat een review achter", utm: { source: "feedback", medium: "qr" } },
];

export function normalizeQrSuggestion(value: { label: string; callToAction: string }) {
  return { label: value.label.trim().slice(0, 60), callToAction: value.callToAction.trim().slice(0, 80) };
}

/** URL-safe campaign slug: lowercase, accents stripped, dashes, max 60 chars. */
export function campaignSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Adds utm_* parameters; values the destination already carries are kept. */
export function withUtm(destination: string, utm: Utm, campaign: string): string {
  const url = new URL(destination);
  const set = (key: string, value: string) => {
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  set("utm_source", utm.source);
  set("utm_medium", utm.medium);
  set("utm_campaign", campaignSlug(campaign));
  return url.toString();
}

/** Preset + optional campaign name → editable label, call to action and tracked destination. */
export function buildPresetSuggestion(
  preset: QrPreset,
  input: { destination: string; campaign?: string; addUtm: boolean },
) {
  const destination = qrDestinationSchema.parse(input.destination);
  const campaign = (input.campaign ?? "").trim();
  const label = campaign ? `${campaign} – ${preset.label}` : preset.label;
  return {
    ...normalizeQrSuggestion({ label, callToAction: preset.callToAction }),
    destination: input.addUtm ? withUtm(destination, preset.utm, campaign || preset.id) : destination,
  };
}
