/**
 * Studio limieten — pure regels, geen I/O.
 *
 * Drie niveaus:
 *   guest    — niet ingelogd: mag ontwerpen en exporteren, maar geen trackbare
 *              korte links maken (die vragen eigenaarschap).
 *   member   — ingelogd: eigen korte links met gegenereerde Base36-code.
 *   verified — geverifieerd of betalend: eigen (vanity) codes en veel meer links.
 *
 * Gedeeld door de UI en de databank-trigger, zodat de grenzen niet uiteenlopen.
 */
import { qrPayloadForSlug } from "@/lib/base36";
import { QR_MAX_VERSION, qrVersionFor } from "@/lib/qr-version";

export type StudioTier = "guest" | "member" | "verified";

export type StudioLimits = {
  /** Mag een trackbare korte link aanmaken. */
  canCreateShortLink: boolean;
  /** Mag een zelfgekozen (vanity) code claimen. */
  canPickVanitySlug: boolean;
  /** Maximum aantal actieve korte links. */
  maxShortLinks: number;
  /** Maximum aantal nieuwe links per uur (spam-rem). */
  maxShortLinksPerHour: number;
  /** Maximum aantal rijen in een batch-export. */
  maxBatchRows: number;
};

export const STUDIO_LIMITS: Record<StudioTier, StudioLimits> = {
  guest: {
    canCreateShortLink: false,
    canPickVanitySlug: false,
    maxShortLinks: 0,
    maxShortLinksPerHour: 0,
    maxBatchRows: 10,
  },
  member: {
    canCreateShortLink: true,
    canPickVanitySlug: false,
    maxShortLinks: 25,
    maxShortLinksPerHour: 10,
    maxBatchRows: 100,
  },
  verified: {
    canCreateShortLink: true,
    canPickVanitySlug: true,
    maxShortLinks: 1000,
    maxShortLinksPerHour: 60,
    maxBatchRows: 5000,
  },
};

export type TierInput = {
  signedIn: boolean;
  verified?: boolean | null;
  isPaid?: boolean | null;
  isEarlyBeliever?: boolean | null;
};

export function studioTier(input: TierInput): StudioTier {
  if (!input.signedIn) return "guest";
  if (input.verified === true || input.isPaid === true || input.isEarlyBeliever === true) {
    return "verified";
  }
  return "member";
}

export function limitsFor(input: TierInput): StudioLimits {
  return STUDIO_LIMITS[studioTier(input)];
}

/** Menselijke uitleg waarom een aanmaak geweigerd wordt, of `null` als het mag. */
export function shortLinkBlockReason(
  input: TierInput,
  currentCount: number,
  wantsVanitySlug = false,
): string | null {
  const limits = limitsFor(input);
  if (!limits.canCreateShortLink) {
    return "Meld je aan om een trackbare korte link te maken.";
  }
  if (currentCount >= limits.maxShortLinks) {
    return `Je hebt het maximum van ${limits.maxShortLinks} actieve korte links bereikt.`;
  }
  if (wantsVanitySlug && !limits.canPickVanitySlug) {
    return "Een zelfgekozen code hoort bij een geverifieerd account — je krijgt nu een korte ROUT-code.";
  }
  return null;
}

/**
 * Canvas-check met automatische versieschaling.
 *
 * Version 1 (21×21) blijft het ideaal — het scant het snelst — maar een
 * langere payload is geen fout meer: we melden simpelweg welke versie de
 * encoder kiest. Alleen boven Version 10 waarschuwen we echt.
 */
export type CanvasCheck = {
  /** Modules per zijde van de versie die de encoder gaat kiezen. */
  modules: number;
  /** Versie 1–10. */
  version: number;
  /** Past de payload binnen Version 1–10? */
  fits: boolean;
  /** Blijft de payload op het ideale 21×21-canvas (Version 1)? */
  isVersion1: boolean;
  payload: string;
  length: number;
  /** Capaciteit van de gekozen versie. */
  capacity: number;
  reason: string | null;
};

export function checkVersion1Canvas(payload: string): CanvasCheck {
  const value = payload ?? "";
  const info = qrVersionFor(value);
  const isVersion1 = info.version === 1 && info.fits;
  return {
    modules: info.modules,
    version: info.version,
    fits: info.fits,
    isVersion1,
    payload: value,
    length: info.length,
    capacity: info.capacity,
    reason: !info.fits
      ? `${info.length} tekens — dat gaat voorbij Version ${QR_MAX_VERSION}; kort de link in.`
      : isVersion1
        ? null
        : `${info.length} tekens — de code schaalt automatisch naar Version ${info.version} (${info.modules}×${info.modules}).`,
  };
}

/** Handige wrapper: check meteen op basis van een slug. */
export function checkSlugCanvas(slug: string, origin?: string): CanvasCheck {
  return checkVersion1Canvas(qrPayloadForSlug(slug, origin));
}
