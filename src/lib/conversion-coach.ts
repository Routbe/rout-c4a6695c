/**
 * Conversie-coach: kleine, deterministische regels die de Studio inline toont
 * bij de linklijst. Client-safe en puur, zodat het ook testbaar blijft.
 */
import type { ProfileBlock } from "./profile";

export interface ConversionTip {
  id: string;
  tone: "warning" | "hint" | "info";
  message: string;
}

/** Titels die niets beloven — bezoekers klikken hier zelden op. */
const GENERIC_TITLES = [
  "blog",
  "website",
  "shop",
  "link",
  "eigen link",
  "instagram",
  "info",
  "hier",
  "klik hier",
  "meer",
];

export const IDEAL_LINK_MAX = 6;

export function isGenericTitle(label: string): boolean {
  const clean = label.trim().toLowerCase();
  if (!clean) return true;
  return GENERIC_TITLES.includes(clean);
}

export function conversionTips(blocks: ProfileBlock[]): ConversionTip[] {
  const active = blocks.filter((block) => !block.hidden);
  const tips: ConversionTip[] = [];

  if (active.length > IDEAL_LINK_MAX) {
    tips.push({
      id: "link-count",
      tone: "warning",
      message: `⚠️ Tip: je hebt ${active.length} actieve links. Beperk je tot 3–6 links voor maximale conversie.`,
    });
  }

  const generic = active.filter((block) => isGenericTitle(block.label));
  if (generic.length > 0) {
    const names = generic
      .slice(0, 3)
      .map((block) => `“${block.label.trim() || "zonder titel"}”`)
      .join(", ");
    tips.push({
      id: "copy-quality",
      tone: "hint",
      message: `💡 Schrijf actiegerichter bij ${names}: bijv. “Bekijk mijn nieuwste aanbod”.`,
    });
  }

  if (active.length > 1) {
    tips.push({
      id: "drag-hint",
      tone: "info",
      message:
        "↕️ Sleep je belangrijkste link naar boven — de bovenste link krijgt tot 70% van alle kliks.",
    });
  }

  return tips;
}

/* ------------------------------------------------------------------ */
/* Audit-engine: score, status en concrete quick fixes                  */
/* ------------------------------------------------------------------ */

/** Signalen die de score bepalen. Puur data, zodat dit testbaar blijft. */
export interface ConversionInput {
  blocks: ProfileBlock[];
  avatarUrl: string | null;
  bio: string | null;
  /** Er is een primaire actie (boeking, contact, tip, vCard …). */
  hasPrimaryAction: boolean;
  /** Minstens één link krijgt een accent-animatie. */
  highlightActive: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
}

export type ConversionStatus = "passive" | "growing" | "magnet";

export interface ConversionAudit {
  score: number;
  status: ConversionStatus;
  label: string;
  /** Tailwind-kleurtoken voor de meter. */
  tone: "red" | "yellow" | "green";
  fixes: ConversionFix[];
}

export interface ConversionFix {
  id: string;
  title: string;
  action: string;
  /** Wat de studio moet doen bij één klik. */
  kind: "add_booking" | "fill_meta" | "add_vcard" | "add_avatar" | "add_bio" | "highlight_cta";
}

/** Blokken die als primair doel tellen. */
const PRIMARY_KINDS = [
  "booking_request",
  "calcom",
  "calendly",
  "contact_form",
  "vcard",
  "kofi",
  "bmac",
  "stripe",
];

export function hasPrimaryAction(blocks: ProfileBlock[]): boolean {
  return blocks.some((b) => !b.hidden && PRIMARY_KINDS.includes(b.kind));
}

export function auditProfile(input: ConversionInput): ConversionAudit {
  const metaComplete = Boolean(input.metaTitle && input.metaDescription && input.ogImageUrl);
  let score = 0;
  if (input.avatarUrl) score += 15;
  if ((input.bio ?? "").trim().length >= 20) score += 15;
  if (input.hasPrimaryAction) score += 25;
  if (input.highlightActive) score += 15;
  if (metaComplete) score += 30;

  const fixes: ConversionFix[] = [];
  if (!input.avatarUrl)
    fixes.push({
      id: "avatar",
      title: "Nog geen profielfoto",
      action: "🖼️ Foto toevoegen",
      kind: "add_avatar",
    });
  if ((input.bio ?? "").trim().length < 20)
    fixes.push({
      id: "bio",
      title: "Je bio vertelt nog te weinig",
      action: "✍️ Bio schrijven",
      kind: "add_bio",
    });
  if (!input.hasPrimaryAction)
    fixes.push({
      id: "cta",
      title: "Geen hoofddoel ingesteld",
      action: "⚡ Boeking toevoegen",
      kind: "add_booking",
    });
  if (!metaComplete)
    fixes.push({
      id: "meta",
      title: "WhatsApp / social share preview mist",
      action: "📝 Vul in",
      kind: "fill_meta",
    });
  if (!input.blocks.some((b) => b.kind === "vcard"))
    fixes.push({
      id: "vcard",
      title: "Contact uitwisselen is lastig",
      action: "🎴 vCard toevoegen",
      kind: "add_vcard",
    });
  if (!input.highlightActive && input.blocks.length > 0)
    fixes.push({
      id: "highlight",
      title: "Geen link krijgt extra aandacht",
      action: "✨ Accent kiezen",
      kind: "highlight_cta",
    });

  if (score < 50) return { score, status: "passive", label: "Passief profiel", tone: "red", fixes };
  if (score < 80)
    return { score, status: "growing", label: "Groeiprofiel", tone: "yellow", fixes };
  return { score, status: "magnet", label: "Conversie-Magneet", tone: "green", fixes };
}

/* ------------------------------------------------------------------ */
/* Lokale checklist: deterministisch, geen externe calls                */
/* ------------------------------------------------------------------ */

export interface PageConversionData {
  avatarUrl: string | null;
  bio: string | null;
  blocks: ProfileBlock[];
  verified?: boolean;
  /** Steunpagina actief of een boekingsblok aanwezig. */
  extraPageActive?: boolean;
}

export interface ConversionCheck {
  id: "avatar" | "bio" | "link_count" | "primary_cta" | "verified" | "extra_page";
  ok: boolean;
  weight: number;
  advice: string;
}

export const OPTIMAL_LINKS = { min: 3, max: 7 } as const;

/** Rule engine for the coach ring. Pure and local: page content never leaves the app. */
export function analyzePageConversion(page: PageConversionData): { percent: number; checks: ConversionCheck[]; todo: ConversionCheck[] } {
  const active = page.blocks.filter((b) => !b.hidden).length;
  const hasBooking = page.blocks.some((b) => !b.hidden && ["booking_request", "calcom", "calendly"].includes(b.kind));
  const checks: ConversionCheck[] = [
    { id: "avatar", ok: Boolean(page.avatarUrl), weight: 15, advice: "Voeg een profielfoto toe: gezichten wekken vertrouwen." },
    { id: "bio", ok: (page.bio ?? "").trim().length >= 20, weight: 15, advice: "Schrijf een bio van minstens 20 tekens: wie ben je en wat bied je?" },
    {
      id: "link_count",
      ok: active >= OPTIMAL_LINKS.min && active <= OPTIMAL_LINKS.max,
      weight: 20,
      advice: active < OPTIMAL_LINKS.min
        ? `Je hebt ${active} actieve link${active === 1 ? "" : "s"}; ${OPTIMAL_LINKS.min}–${OPTIMAL_LINKS.max} werkt het best.`
        : `Je hebt ${active} actieve links; beperk tot ${OPTIMAL_LINKS.max} zodat bezoekers sneller kiezen.`,
    },
    { id: "primary_cta", ok: hasPrimaryAction(page.blocks), weight: 25, advice: "Stel één hoofdactie in, zoals boeken, contact of steun." },
    { id: "verified", ok: Boolean(page.verified), weight: 10, advice: "Verifieer je profiel voor het blauwe vinkje." },
    { id: "extra_page", ok: Boolean(page.extraPageActive) || hasBooking, weight: 15, advice: "Activeer een steunpagina of boekingen voor een directe conversie." },
  ];
  const percent = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  return { percent, checks, todo: checks.filter((c) => !c.ok) };
}
