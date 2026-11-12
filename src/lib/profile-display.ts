import { DEFAULT_VISIT_CUSTOM, normalizeVisitCustom, type VisitEffectCustom } from "./visit-effect-custom";
import { cleanCustomPrompt, resolvePromptKey } from "@/lib/qa/prompts";
import {
  normalizeBubbleFont,
  normalizeBubblePosition,
  normalizeBubbleStyle,
  normalizePresenceIndicator,
  singleEmoji,
  type BubbleFont,
  type BubblePosition,
  type BubbleStyle,
  type PresenceIndicator,
} from "@/lib/status-bubble";
import { isEmptyLayers, normalizeDesignLayers, serializeDesignLayers } from "./design-layers";
import { stripBioLinks } from "@/lib/bio-rules";
import type { ProfileQrStyle } from "@/lib/profile-qr";
import { normalizeQrSettings } from "@/lib/qr-settings";
/**
 * Weergavevoorkeuren van een publiek ROUT-profiel.
 *
 * Alles wat *niet* over de inhoud van het profiel gaat (badge, watermerk,
 * achtergrondpatroon, typografie, identiteitsmodus) leeft hier als één
 * JSON-blob (`profiles.display_prefs`). Zo blijft de tabel stabiel en kan de
 * studio nieuwe opties toevoegen zonder migratie per schakelaar.
 */

/**
 * Welke badge naast de naam staat:
 *  • `verified` — blauw vinkje: identiteit + volledige naam en land bevestigd
 *  • `human`    — privacy-schild: bevestigd mens, naam blijft privé
 *  • `domain`   — zwarte domeinbadge: eigendom van de domeinnaam bewezen via DNS
 *  • `none`     — geen badge (moet niet)
 */
export type BadgeType = "verified" | "human" | "domain" | "influencer" | "none";
/** Achterzetsel achter de badge zodat het vinkje op elke achtergrond leesbaar blijft. */
export type BadgeBackdrop = "none" | "glow" | "sticker" | "ring";
export type BadgeNameFormat = "full" | "initials" | "lower";
export type IdentityMode = "legal" | "private";
export type BackgroundStyle =
  | "solid"
  | "grid"
  | "gradient"
  | "dots"
  | "mesh"
  | "noise"
  | "waves"
  | "topography"
  | "circuit"
  | "aurora"
  | "carbon"
  | "stripes"
  | "honeycomb"
  | "blueprint"
  | "stars"
  | "spotlight";
export type Typography = "sans" | "serif" | "mono";
/** Avatarvorm op het publieke profiel. */
export type AvatarShape = "circle" | "rounded" | "squircle" | "hexagon";

export const AVATAR_SHAPES: { id: AvatarShape; label: string }[] = [
  { id: "circle", label: "Cirkel" },
  { id: "rounded", label: "Vierkant" },
  { id: "squircle", label: "Squircle" },
  { id: "hexagon", label: "Hexagon" },
];

/** CSS-klasse + clip-path voor de gekozen avatarvorm. */
export function avatarShapeStyle(shape: AvatarShape): {
  className: string;
  style?: Record<string, string>;
} {
  if (shape === "rounded") return { className: "rounded-2xl" };
  if (shape === "squircle") return { className: "rounded-[38%]" };
  if (shape === "hexagon")
    return {
      className: "rounded-none",
      style: {
        clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
      },
    };
  return { className: "rounded-full" };
}
/** 24 avatarkaders — definities leven in `@/lib/avatar-frames`. */
export type { AvatarFrame } from "./avatar-frames";
export type { AvatarDecoration, PresenceStatus } from "./avatar-decorations";
export {
  AVATAR_FRAME_DEFS,
  AVATAR_FRAME_CATEGORIES,
  avatarFrameLabel,
  avatarFrameStyle,
} from "./avatar-frames";
import { normalizeAvatarFrame, type AvatarFrame } from "./avatar-frames";
import {
  normalizeAvatarDecoration,
  normalizePresence,
  type AvatarDecoration,
  type PresenceStatus,
} from "./avatar-decorations";
import { normalizeVisitEffect, type VisitEffect } from "./visit-effects";
import { FAVORITE_LAYOUTS, normalizeFavorites, type FavoriteLayout, type ProfileFavorite } from "./favorites";
import {
  DEFAULT_DESIGN_PREFS,
  normalizeDesignPrefs,
  type ProfileDesignPrefs,
} from "./profile-design";
/** Design Studio (presets, wallpaper, knoppen, typografie, footer). */
export * from "./profile-design";
/** Favorieten (film, serie, boek, …) — definities leven in `@/lib/favorites`. */
export type { ProfileFavorite, FavoriteKind, FavoriteLayout } from "./favorites";
export {
  FAVORITE_KINDS,
  FAVORITE_KIND_LABEL,
  FAVORITE_KIND_EMOJI,
  MAX_FAVORITES,
  newFavoriteId,
} from "./favorites";
/** Bezoekers Special FX — definities leven in `@/lib/visit-effects`. */
export type { VisitEffect } from "./visit-effects";
export { VISIT_EFFECTS, runVisitEffect } from "./visit-effects";
export type BannerStyle = "none" | "gradient" | "image";
/** Richting van het kleurverloop in de banner (of radiaal vanuit het midden). */
export type BannerDirection =
  | "to right"
  | "to left"
  | "to bottom"
  | "to top"
  | "to bottom right"
  | "to bottom left"
  | "to top right"
  | "to top left"
  | "radial";
export type NameAccent =
  | "classic"
  | "gold"
  | "neon"
  | "chrome"
  | "sunset"
  | "ocean"
  | "emerald"
  | "candy"
  | "fire"
  | "silver"
  | "rainbow"
  | "outline";

export interface ProfileDisplayPrefs {
  /** "legal" = handle blijft herleidbaar naar de wettelijke naam. */
  identityMode: IdentityMode;
  badgeVisible: boolean;
  /** Mens-badge op het alias-profiel (`/u/…`) van een geverifieerd lid. */
  humanBadgeVisible: boolean;
  /** Badgeverzameling onder de profielkop tonen. */
  badgeShowcaseVisible: boolean;
  /** Openbaar profiel aan/uit. Uit = bezoekers zien geen inhoud. */
  publicProfile: boolean;
  /** Visitors get a Pro/Social switch at the top of the profile. */
  contextToggle: boolean;
  /** Openbare tijdlijn (mijlpalen, badges, status) tonen. */
  timelineVisible: boolean;
  /** Anonieme vragen-blok op het profiel tonen en vragen aannemen. */
  questionsEnabled: boolean;
  /** NGL-style headline prompt key for the Q&A ("custom" uses qaPromptCustom). */
  qaPrompt: string;
  qaPromptCustom: string | null;
  /** Q&A block on the profile hub. */
  qaOnHub: boolean;
  /** Dedicated /ask page. */
  qaPage: boolean;
  qaAudience: "public_unrestricted" | "members_only" | "verified_only";
  qaShowAvatar: boolean;
  qaShowProfileLink: boolean;
  qaIntroSeen: boolean;
  guestbookEnabled: boolean;
  /** Steam live card on the profile (opt-in). */
  steamPresence: boolean;
  /** Last.fm "now playing" card on the profile (opt-in). */
  lastfmPresence: boolean;
  /** Live Presence → Pulse: green 24-hour ring around the avatar (on by default). */
  pulseRing: boolean;
  /** Laser border / live aura effects on live cards. */
  cardEffects: boolean;
  badgeType: BadgeType;
  badgeNameFormat: BadgeNameFormat;
  /** Achtergrondje achter de badge (gloed, sticker of randje). */
  badgeBackdrop: BadgeBackdrop;
  /** Kleur van dat achterzetsel; `null` = automatisch. */
  badgeBackdropColor: string | null;
  /** `null` = volg de standaard (gratis toont watermerk, betalend niet). */
  showWatermark: boolean | null;
  backgroundStyle: BackgroundStyle;
  typography: Typography;
  avatarFrame: AvatarFrame;
  /** Discord-achtige decoratie bovenop de avatar. */
  avatarDecoration: AvatarDecoration;
  /** Statusbolletje op de avatar (online, afwezig, focus …). */
  presence: PresenceStatus;
  /** Discord-achtige aangepaste status (korte tekst naast het bolletje). */
  presenceText: string | null;
  /** Emoji voor de aangepaste status. */
  presenceEmoji: string | null;
  bannerStyle: BannerStyle;
  bannerImageUrl: string | null;
  /** Kleurenpaar voor de gradient-banner. */
  bannerFrom: string | null;
  bannerTo: string | null;
  /** Vanwaar het verloop start. */
  bannerDirection: BannerDirection;
  /** Overschrijft de themakleur van het canvas / het patroonaccent. */
  canvasColor: string | null;
  patternColor: string | null;
  /** Korte status, getoond als spreekballon bij de avatar. */
  statusLine: string | null;
  /** Spreekballon: plaats t.o.v. de avatar, stijl, eigen achtergrond en lettertype. */
  statusBubblePosition: BubblePosition;
  statusBubbleStyle: BubbleStyle;
  statusBubbleBg: string | null;
  statusBubbleFont: BubbleFont;
  /** Statusbolletje: effen kleur, kleur + icoon, of één emoji (`presenceEmoji`). */
  presenceIndicator: PresenceIndicator;
  nameAccent: NameAccent;
  /** Social sharing & SEO (Studio → "Social Sharing & SEO"). */
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  /** Accentkleur voor <meta name="theme-color"> (Discord/mobiele browserbalk). */
  accentColor: string | null;
  /** Meertalige bio; leeg = val terug op `profiles.bio`. */
  bioNl: string | null;
  bioEn: string | null;
  bioFr: string | null;
  /** Toont de "Contact opslaan" (vCard) knop op het publieke profiel. */
  showVcardButton: boolean;
  /** Eigen opschrift voor de contactknop (leeg = standaardtekst). */
  vcardLabel: string | null;
  /** Welke gegevens in de contactkaart terechtkomen. */
  vcardIncludeAvatar: boolean;
  vcardIncludeBio: boolean;
  vcardIncludeEmail: boolean;
  vcardIncludeLinks: boolean;
  /** Extra contactgegevens die enkel in de contactkaart zitten. */
  vcardPhone: string | null;
  vcardOrg: string | null;
  /** Entree-effect voor bezoekers (`none` = uit). */
  visitEffect: VisitEffect;
  /** Eigen emoji-bezoekeffect; wint van `visitEffect` als `enabled`. */
  visitEffectCustom: VisitEffectCustom;
  /** Favoriete films, series, boeken … met (eigen of opgehaalde) afbeelding. */
  favorites: ProfileFavorite[];
  /** Vorm van de avatar op het publieke profiel. */
  avatarShape: AvatarShape;
  /** Korte locatie-/herkomstbadge, bv. "📍 Brussel, België". */
  locationBadge: string | null;
  /** Toont de locatiebadge op het publieke profiel. */
  locationVisible: boolean;
  /** Indeling van de favorietenstrook. */
  favoritesLayout: FavoriteLayout;
  /** Id van de link die extra aandacht krijgt. */
  ctaBlockId: string | null;
  /** Accent-animatie voor die link. */
  ctaEffect: "none" | "glow" | "pulse" | "shimmer";
  /** Layered Design Studio as normalized JSON (see design-layers.ts); "" = off. */
  designLayers: string;
  /** Opgeslagen stijl van de profiel-QR (null = standaard ROUT-stijl). */
  qrSettings?: ProfileQrStyle | null;
}

/** Alle designvelden zitten in dezelfde JSON-blob. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges design prefs into the interface above
export interface ProfileDisplayPrefs extends ProfileDesignPrefs {}

export const DEFAULT_DISPLAY_PREFS: ProfileDisplayPrefs = {
  identityMode: "legal",
  badgeVisible: true,
  humanBadgeVisible: true,
  badgeShowcaseVisible: true,
  publicProfile: true,
  contextToggle: false,
  timelineVisible: true,
  questionsEnabled: false,
  qaPrompt: "anything",
  qaPromptCustom: null,
  qaOnHub: true,
  qaPage: false,
  qaAudience: "members_only",
  qaShowAvatar: true,
  qaShowProfileLink: true,
  qaIntroSeen: false,
  guestbookEnabled: false,
  steamPresence: false,
  lastfmPresence: false,
  pulseRing: true,
  cardEffects: false,
  badgeType: "verified",
  badgeNameFormat: "full",
  badgeBackdrop: "none",
  badgeBackdropColor: null,
  showWatermark: null,
  backgroundStyle: "solid",
  typography: "sans",
  avatarFrame: "none",
  avatarDecoration: "none",
  presence: "none",
  presenceText: null,
  presenceEmoji: null,
  bannerStyle: "none",
  bannerImageUrl: null,
  bannerFrom: null,
  bannerTo: null,
  bannerDirection: "to bottom right",
  canvasColor: null,
  patternColor: null,
  statusLine: null,
  statusBubblePosition: "top-right",
  statusBubbleStyle: "obsidian-flat",
  statusBubbleBg: null,
  statusBubbleFont: "theme",
  presenceIndicator: "color",
  nameAccent: "classic",
  metaTitle: null,
  metaDescription: null,
  ogImageUrl: null,
  accentColor: null,
  bioNl: null,
  bioEn: null,
  bioFr: null,
  showVcardButton: false,
  vcardLabel: null,
  vcardIncludeAvatar: true,
  vcardIncludeBio: true,
  vcardIncludeEmail: true,
  vcardIncludeLinks: true,
  vcardPhone: null,
  vcardOrg: null,
  visitEffect: "none",
  visitEffectCustom: DEFAULT_VISIT_CUSTOM,
  favorites: [],
  avatarShape: "circle",
  locationBadge: null,
  locationVisible: true,
  favoritesLayout: "grid",
  designLayers: "",
  ctaBlockId: null,
  ctaEffect: "none",
  qrSettings: null,
  ...DEFAULT_DESIGN_PREFS,
};

export { AVATAR_FRAME_DEFS as AVATAR_FRAMES } from "./avatar-frames";
export {
  AVATAR_DECORATION_DEFS,
  DECORATION_CATEGORIES,
  PRESENCE_DEFS,
  avatarDecorationLabel,
} from "./avatar-decorations";

export const BANNER_STYLES: { id: BannerStyle; label: string }[] = [
  { id: "none", label: "Geen banner" },
  { id: "gradient", label: "Kleurverloop" },
  { id: "image", label: "Eigen afbeelding" },
];

/** Richtingen voor het bannerverloop — het pijltje toont waar het naartoe loopt. */
export const BANNER_DIRECTIONS: { id: BannerDirection; label: string }[] = [
  { id: "to right", label: "→ Naar rechts" },
  { id: "to left", label: "← Naar links" },
  { id: "to bottom", label: "↓ Naar onder" },
  { id: "to top", label: "↑ Naar boven" },
  { id: "to bottom right", label: "↘ Linksboven → rechtsonder" },
  { id: "to bottom left", label: "↙ Rechtsboven → linksonder" },
  { id: "to top right", label: "↗ Linksonder → rechtsboven" },
  { id: "to top left", label: "↖ Rechtsonder → linksboven" },
  { id: "radial", label: "◎ Radiaal uit het midden" },
];

export const NAME_ACCENTS: { id: NameAccent; label: string }[] = [
  { id: "classic", label: "Klassiek crème" },
  { id: "gold", label: "Goud verloop" },
  { id: "neon", label: "Neon glow" },
  { id: "chrome", label: "Dark chrome" },
  { id: "sunset", label: "Sunset" },
  { id: "ocean", label: "Ocean" },
  { id: "emerald", label: "Emerald" },
  { id: "candy", label: "Candy" },
  { id: "fire", label: "Fire" },
  { id: "silver", label: "Zilver" },
  { id: "rainbow", label: "Regenboog" },
  { id: "outline", label: "Outline" },
];

export const BADGE_TYPES: { id: BadgeType; label: string; note: string }[] = [
  {
    id: "verified",
    label: "Blauw vinkje",
    note: "Bevestigt je identiteit: volledige naam en land (bv. BE).",
  },
  {
    id: "human",
    label: "Privacy-schild",
    note: "Bevestigt: echte mens, zonder je naam te tonen.",
  },
  {
    id: "domain",
    label: "Bedrijfsbadge (zwart)",
    note: "Bevestigt een bedrijf: officiële naam, btw-nummer en domeinnaam gecontroleerd.",
  },
  {
    id: "influencer",
    label: "Influencerbadge (roze)",
    note: "Bevestigt een publiek profiel met gecontroleerde sociale kanalen.",
  },
  {
    id: "none",
    label: "Geen badge",
    note: "Toont niets naast je naam — een badge moet niet.",
  },
];

export const BADGE_BACKDROPS: { id: BadgeBackdrop; label: string; note: string }[] = [
  { id: "none", label: "Geen", note: "Enkel het pictogram." },
  { id: "glow", label: "Lichtgloed", note: "Zachte gloed errond." },
  { id: "sticker", label: "Ronde sticker", note: "Gevulde cirkel erachter." },
  { id: "ring", label: "Lichte rand", note: "Fijn randje errond." },
];

export const BADGE_NAME_FORMATS: { id: BadgeNameFormat; label: string }[] = [
  { id: "full", label: "Volledige naam" },
  { id: "initials", label: "Initialen (J.Delplanche)" },
  { id: "lower", label: "Kleine letters" },
];

export const BACKGROUND_STYLES: { id: BackgroundStyle; label: string }[] = [
  { id: "solid", label: "Effen" },
  { id: "grid", label: "Subtiel raster" },
  { id: "gradient", label: "Zachte gradient" },
  { id: "dots", label: "Dot matrix" },
  { id: "mesh", label: "Mesh gradient" },
  { id: "noise", label: "Subtiele ruis" },
  { id: "waves", label: "Golven" },
  { id: "topography", label: "Hoogtelijnen" },
  { id: "circuit", label: "Circuit" },
  { id: "aurora", label: "Aurora" },
  { id: "carbon", label: "Carbon" },
  { id: "stripes", label: "Diagonale strepen" },
  { id: "honeycomb", label: "Honingraat" },
  { id: "blueprint", label: "Blauwdruk" },
  { id: "stars", label: "Sterrenhemel" },
  { id: "spotlight", label: "Spotlight" },
];

export const TYPOGRAPHY_STYLES: { id: Typography; label: string }[] = [
  { id: "sans", label: "Modern (Sans)" },
  { id: "serif", label: "Klassiek (Serif)" },
  { id: "mono", label: "Technisch (Mono)" },
];

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Alleen veilige, korte CSS-kleuren (hex) uit de database vertrouwen. */
const colorOrNull = (value: unknown): string | null =>
  typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : null;

const textOrNull = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
};

const urlOrNull = (value: unknown): string | null =>
  typeof value === "string" && /^https?:\/\//.test(value.trim()) ? value.trim() : null;

/** Leest een (mogelijk ontbrekende) JSON-blob uit de database veilig uit. */
export function parseDisplayPrefs(raw: unknown): ProfileDisplayPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DISPLAY_PREFS };
  const r = raw as Record<string, unknown>;
  return {
    identityMode: oneOf(r["identityMode"], ["legal", "private"] as const, "legal"),
    badgeVisible: r["badgeVisible"] === undefined ? true : Boolean(r["badgeVisible"]),
    humanBadgeVisible: r["humanBadgeVisible"] === undefined ? true : Boolean(r["humanBadgeVisible"]),
    badgeShowcaseVisible:
      r["badgeShowcaseVisible"] === undefined ? true : Boolean(r["badgeShowcaseVisible"]),
    publicProfile: r["publicProfile"] === undefined ? true : Boolean(r["publicProfile"]),
    contextToggle: r["contextToggle"] === true,
    timelineVisible: r["timelineVisible"] === undefined ? true : Boolean(r["timelineVisible"]),
    questionsEnabled: r["questionsEnabled"] === true,
    qaPrompt: resolvePromptKey(r["qaPrompt"]),
    qaPromptCustom: cleanCustomPrompt(r["qaPromptCustom"]),
    qaOnHub: r["qaOnHub"] !== false,
    qaPage: r["qaPage"] === true,
    qaAudience: oneOf(r["qaAudience"], ["public_unrestricted", "members_only", "verified_only"] as const, "members_only"),
    qaShowAvatar: r["qaShowAvatar"] !== false,
    qaShowProfileLink: r["qaShowProfileLink"] !== false,
    qaIntroSeen: r["qaIntroSeen"] === true,
    guestbookEnabled: r["guestbookEnabled"] === true,
    steamPresence: r["steamPresence"] === true,
    lastfmPresence: r["lastfmPresence"] === true,
    pulseRing: r["pulseRing"] !== false,
    cardEffects: r["cardEffects"] === true,
    badgeType: oneOf(r["badgeType"], ["verified", "human", "domain", "influencer", "none"] as const, "verified"),
    badgeNameFormat: oneOf(r["badgeNameFormat"], ["full", "initials", "lower"] as const, "full"),
    badgeBackdrop: oneOf(r["badgeBackdrop"], ["none", "glow", "sticker", "ring"] as const, "none"),
    badgeBackdropColor: colorOrNull(r["badgeBackdropColor"]),
    showWatermark:
      r["showWatermark"] === null || r["showWatermark"] === undefined
        ? null
        : Boolean(r["showWatermark"]),
    backgroundStyle: oneOf(
      r["backgroundStyle"],
      BACKGROUND_STYLES.map((o) => o.id),
      "solid",
    ),
    typography: oneOf(r["typography"], ["sans", "serif", "mono"] as const, "sans"),
    avatarFrame: normalizeAvatarFrame(r["avatarFrame"]),
    avatarDecoration: normalizeAvatarDecoration(r["avatarDecoration"]),
    presence: normalizePresence(r["presence"]),
    presenceText: textOrNull(r["presenceText"], 60),
    presenceEmoji: singleEmoji(r["presenceEmoji"]),
    bannerStyle: oneOf(r["bannerStyle"], ["none", "gradient", "image"] as const, "none"),
    bannerImageUrl: urlOrNull(r["bannerImageUrl"]),
    bannerFrom: colorOrNull(r["bannerFrom"]),
    bannerTo: colorOrNull(r["bannerTo"]),
    bannerDirection: oneOf(
      r["bannerDirection"],
      [
        "to right",
        "to left",
        "to bottom",
        "to top",
        "to bottom right",
        "to bottom left",
        "to top right",
        "to top left",
        "radial",
      ] as const,
      "to bottom right",
    ),
    canvasColor: colorOrNull(r["canvasColor"]),
    patternColor: colorOrNull(r["patternColor"]),
    statusLine: textOrNull(r["statusLine"], 60),
    statusBubblePosition: normalizeBubblePosition(r["statusBubblePosition"]),
    statusBubbleStyle: normalizeBubbleStyle(r["statusBubbleStyle"]),
    statusBubbleBg: colorOrNull(r["statusBubbleBg"]),
    statusBubbleFont: normalizeBubbleFont(r["statusBubbleFont"]),
    presenceIndicator: normalizePresenceIndicator(r["presenceIndicator"]),
    nameAccent: oneOf(
      r["nameAccent"],
      NAME_ACCENTS.map((o) => o.id),
      "classic",
    ),
    metaTitle: textOrNull(r["metaTitle"], 70),
    metaDescription: textOrNull(r["metaDescription"], 200),
    ogImageUrl: urlOrNull(r["ogImageUrl"]),
    accentColor: colorOrNull(r["accentColor"]),
    bioNl: stripBioLinks(textOrNull(r["bioNl"], 500)),
    bioEn: stripBioLinks(textOrNull(r["bioEn"], 500)),
    bioFr: stripBioLinks(textOrNull(r["bioFr"], 500)),
    showVcardButton: Boolean(r["showVcardButton"]),
    vcardLabel: textOrNull(r["vcardLabel"], 40),
    vcardIncludeAvatar: r["vcardIncludeAvatar"] === undefined ? true : Boolean(r["vcardIncludeAvatar"]),
    vcardIncludeBio: r["vcardIncludeBio"] === undefined ? true : Boolean(r["vcardIncludeBio"]),
    vcardIncludeEmail: r["vcardIncludeEmail"] === undefined ? true : Boolean(r["vcardIncludeEmail"]),
    vcardIncludeLinks: r["vcardIncludeLinks"] === undefined ? true : Boolean(r["vcardIncludeLinks"]),
    vcardPhone: textOrNull(r["vcardPhone"], 40),
    vcardOrg: textOrNull(r["vcardOrg"], 80),
    visitEffect: normalizeVisitEffect(r["visitEffect"]),
    visitEffectCustom: normalizeVisitCustom(r["visitEffectCustom"]),
    favorites: normalizeFavorites(r["favorites"]),
    avatarShape: oneOf(
      r["avatarShape"],
      AVATAR_SHAPES.map((o) => o.id),
      "circle",
    ),
    locationBadge: textOrNull(r["locationBadge"], 60),
    locationVisible: r["locationVisible"] === undefined ? true : Boolean(r["locationVisible"]),
    favoritesLayout: oneOf(r["favoritesLayout"], [...FAVORITE_LAYOUTS], "grid"),
    ctaBlockId: textOrNull(r["ctaBlockId"], 60),
    ctaEffect: oneOf(r["ctaEffect"], ["none", "glow", "pulse", "shimmer"], "none"),
    designLayers: normalizeLayersPref(r["designLayers"]),
    qrSettings: normalizeQrSettings(r["qrSettings"]),
    ...normalizeDesignPrefs(r),
  };
}

/** Alias: valideert een ruwe `display_prefs`-blob. */
export const normalizeDisplayPrefs = parseDisplayPrefs;

/** CSS voor de bannerkaart boven het profiel. `null` = geen banner tonen. */
export function bannerStyleOf(
  prefs: ProfileDisplayPrefs,
  theme: { bg: string; card: string; border: string; accent?: string },
): Record<string, string> | null {
  const accent = theme.accent ?? theme.border;
  if (prefs.bannerStyle === "image" && prefs.bannerImageUrl) {
    return {
      backgroundImage: `url("${prefs.bannerImageUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (prefs.bannerStyle === "gradient") {
    const from = prefs.bannerFrom ?? accent;
    const to = prefs.bannerTo ?? theme.card;
    const dir = prefs.bannerDirection;
    return {
      backgroundImage:
        dir === "radial"
          ? `radial-gradient(circle at 50% 50%, ${from}, ${to})`
          : `linear-gradient(${dir}, ${from}, ${to})`,
    };
  }
  return null;
}

/** Tekststijl voor de weergavenaam volgens het gekozen accent. */
export function nameAccentStyle(
  accent: NameAccent,
  theme: { text: string; accent?: string },
): Record<string, string> {
  const a = theme.accent ?? theme.text;
  switch (accent) {
    case "gold":
      return {
        backgroundImage: "linear-gradient(100deg,#f4e2b0,#d8b455 40%,#8a6a24)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "neon":
      return { color: a, textShadow: `0 0 18px ${a}, 0 0 42px ${a}` };
    case "chrome":
      return {
        backgroundImage: `linear-gradient(180deg, ${theme.text}, color-mix(in oklab, ${theme.text} 45%, transparent))`,
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "sunset":
      return {
        backgroundImage: "linear-gradient(100deg,#ff9a5a,#ff5f6d 55%,#c2417f)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "ocean":
      return {
        backgroundImage: "linear-gradient(100deg,#5cbdb9,#2d8a9e 50%,#1e3a5f)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "emerald":
      return {
        backgroundImage: "linear-gradient(100deg,#a7f3d0,#22c55e 50%,#064e3b)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "candy":
      return {
        backgroundImage: "linear-gradient(100deg,#c4b5fd,#f472b6 50%,#67e8f9)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "fire":
      return {
        backgroundImage: "linear-gradient(100deg,#fcd34d,#f97316 45%,#b91c1c)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "silver":
      return {
        backgroundImage: "linear-gradient(180deg,#ffffff,#cbd5e1 45%,#64748b)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "rainbow":
      return {
        backgroundImage: "linear-gradient(100deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      };
    case "outline":
      return {
        color: "transparent",
        WebkitTextStroke: `1px ${theme.text}`,
      };
    default:
      return { color: theme.text };
  }
}

/**
 * Gratis leden dragen altijd het "Made with ROUT"-watermerk; geverifieerde /
 * betalende leden krijgen standaard een white-label profiel en mogen het
 * merkje in de studio alsnog aanzetten.
 */
export function shouldShowWatermark(verified: boolean, prefs: ProfileDisplayPrefs): boolean {
  if (!verified) return true;
  return prefs.showWatermark ?? false;
}

/** Naamweergave naast de badge, volgens de gekozen opmaak. */
export function formatBadgeName(name: string, format: BadgeNameFormat): string {
  const clean = name.trim();
  if (!clean) return "";
  if (format === "lower") return clean.toLowerCase();
  if (format === "initials") {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return clean;
    const last = parts[parts.length - 1]!;
    const initials = parts
      .slice(0, -1)
      .map((p) => `${p[0]!.toUpperCase()}.`)
      .join("");
    return `${initials}${last}`;
  }
  return clean;
}

export const BADGE_VERIFIED_BODY =
  "Officieel geverifieerd lid. Identiteit en accountstatus zijn succesvol gevalideerd via ROUT.";

export const BADGE_DOMAIN_BODY =
  "Bedrijfsaccount. De officiële bedrijfsnaam, het btw-nummer en de domeinnaam zijn door ROUT nagekeken. De pagina draait op de officiële domeinnaam van het bedrijf.";

export const BADGE_INFLUENCER_BODY =
  "Publiek profiel. De sociale kanalen achter dit account zijn door ROUT gecontroleerd en horen aantoonbaar bij deze persoon.";

export const BADGE_HUMAN_BODY =
  "Dit account is gekoppeld aan een geverifieerd ROUT-account: een bevestigde mens. De wettelijke naam blijft hier privé — die staat enkel bij het blauwe vinkje op het geverifieerde profiel.";

/** CSS-achtergrondlagen voor het gekozen patroon, bovenop de themakleur. */
export function backgroundLayers(
  style: BackgroundStyle,
  theme: { bg: string; border: string; accent?: string; card: string },
): { background: string; backgroundSize?: string } {
  const accent = theme.accent ?? theme.border;
  switch (style) {
    case "grid":
      return {
        background: `linear-gradient(${theme.border} 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, ${theme.border} 1px, transparent 1px) 0 0 / 32px 32px, ${theme.bg}`,
      };
    case "gradient":
      return {
        background: `linear-gradient(180deg, ${theme.card} 0%, ${theme.bg} 55%, ${theme.bg} 100%)`,
      };
    case "dots":
      return {
        background: `radial-gradient(${theme.border} 1.2px, transparent 1.2px) 0 0 / 18px 18px, ${theme.bg}`,
      };
    case "mesh":
      return {
        background: `radial-gradient(45rem 30rem at 12% 8%, ${accent}44, transparent 60%), radial-gradient(38rem 28rem at 88% 18%, ${theme.card}, transparent 62%), radial-gradient(40rem 32rem at 50% 100%, ${accent}22, transparent 65%), ${theme.bg}`,
      };
    case "noise":
      return {
        background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.28'/%3E%3C/svg%3E"), ${theme.bg}`,
      };
    case "waves":
      return {
        background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40'%3E%3Cpath d='M0 20c15-14 30-14 45 0s30 14 45 0 30-14 45 0' fill='none' stroke='${encodeURIComponent(theme.border)}' stroke-width='1.2'/%3E%3C/svg%3E") 0 0 / 120px 40px, ${theme.bg}`,
      };
    case "topography":
      return {
        background: `radial-gradient(circle at 50% 50%, transparent 38%, ${theme.border} 39%, transparent 40%) 0 0 / 90px 90px, radial-gradient(circle at 50% 50%, transparent 26%, ${theme.border} 27%, transparent 28%) 45px 45px / 90px 90px, ${theme.bg}`,
      };
    case "circuit":
      return {
        background: `linear-gradient(${theme.border} 1px, transparent 1px) 0 0 / 48px 48px, linear-gradient(90deg, ${theme.border} 1px, transparent 1px) 0 0 / 48px 48px, radial-gradient(${accent} 2px, transparent 2px) 0 0 / 48px 48px, ${theme.bg}`,
      };
    case "aurora":
      return {
        background: `radial-gradient(40rem 26rem at 18% 0%, ${accent}55, transparent 62%), radial-gradient(42rem 28rem at 82% 18%, ${theme.card}, transparent 60%), radial-gradient(36rem 24rem at 50% 96%, ${accent}33, transparent 64%), ${theme.bg}`,
      };
    case "carbon":
      return {
        background: `repeating-linear-gradient(45deg, ${theme.card} 0 6px, ${theme.bg} 6px 12px)`,
      };
    case "stripes":
      return {
        background: `repeating-linear-gradient(135deg, ${theme.card} 0 14px, ${theme.bg} 14px 28px)`,
      };
    case "honeycomb":
      return {
        background: `radial-gradient(circle farthest-side at 0% 50%, ${theme.bg} 23.5%, transparent 0) 21px 30px / 42px 60px, radial-gradient(circle farthest-side at 0% 50%, ${theme.border} 24%, transparent 0) 19px 30px / 42px 60px, ${theme.bg}`,
      };
    case "blueprint":
      return {
        background: `linear-gradient(${accent}33 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, ${accent}33 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(${accent}22 1px, transparent 1px) 0 0 / 120px 120px, linear-gradient(90deg, ${accent}22 1px, transparent 1px) 0 0 / 120px 120px, ${theme.bg}`,
      };
    case "stars":
      return {
        background: `radial-gradient(1.4px 1.4px at 20% 30%, ${theme.border}, transparent), radial-gradient(1.2px 1.2px at 70% 20%, ${theme.border}, transparent), radial-gradient(1.6px 1.6px at 40% 70%, ${theme.border}, transparent), radial-gradient(1.2px 1.2px at 85% 65%, ${theme.border}, transparent), ${theme.bg}`,
        backgroundSize: "220px 220px",
      };
    case "spotlight":
      return {
        background: `radial-gradient(50rem 34rem at 50% -10%, ${accent}44, transparent 65%), ${theme.bg}`,
      };
    default:
      return { background: theme.bg };
  }
}

/** Alleen de textuur (raster, ruis, dots, …) zonder basiskleur, om over een
 * eigen achtergrond te leggen. `null` voor stijlen die een volledige achtergrond zijn. */
export function textureLayer(
  style: BackgroundStyle,
  theme: { bg: string; border: string; accent?: string; card: string },
): { backgroundImage: string; backgroundSize?: string } | null {
  if (["gradient", "carbon", "stripes", "honeycomb"].includes(style)) return null;
  const l = backgroundLayers(style, { ...theme, bg: "transparent" });
  if (l.background === "transparent") return null;
  return { backgroundImage: l.background.replace(/,\s*transparent$/, ""), backgroundSize: l.backgroundSize };
}

export const FONT_FAMILY: Record<Typography, string | undefined> = {
  sans: undefined,
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

/** Knopstijl (vorm + effect) voor een linkblok, afgeleid van het thema. */
export function blockButtonStyle(
  cardStyle: string,
  theme: { bg: string; card: string; text: string; border: string; accent?: string },
): Record<string, string | number> {
  const accent = theme.accent ?? theme.border;
  const base: Record<string, string | number> = {
    borderRadius: 16,
    background: theme.card,
    color: theme.text,
    border: "1px solid transparent",
  };
  switch (cardStyle) {
    case "pill":
      return { ...base, borderRadius: 999, border: `1px solid ${theme.border}` };
    case "solid":
      return { ...base, background: theme.text, color: theme.bg, border: "1px solid transparent" };
    case "sharp":
      return { ...base, borderRadius: 0, border: `1px solid ${theme.text}` };
    case "glass":
      return {
        ...base,
        borderRadius: 18,
        background: `color-mix(in oklab, ${theme.card} 55%, transparent)`,
        border: `1px solid color-mix(in oklab, ${theme.text} 18%, transparent)`,
        backdropFilter: "blur(14px) saturate(140%)",
      };
    case "neon":
      return {
        ...base,
        borderRadius: 14,
        border: `1px solid ${accent}`,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${accent} 25%, transparent), 0 8px 30px -8px ${accent}`,
      };
    default:
      return { ...base, border: `1px solid ${theme.border}` };
  }
}

/* --------------------------------------------------- meertalige bio (NL/EN/FR) */

export const BIO_LOCALES = ["nl", "en", "fr"] as const;
export type BioLocale = (typeof BIO_LOCALES)[number];

export const BIO_LOCALE_LABEL: Record<BioLocale, string> = {
  nl: "NL",
  en: "EN",
  fr: "FR",
};

const BIO_KEY: Record<BioLocale, "bioNl" | "bioEn" | "bioFr"> = {
  nl: "bioNl",
  en: "bioEn",
  fr: "bioFr",
};

/** Welke vertalingen heeft dit profiel effectief ingevuld? */
export function availableBioLocales(prefs: ProfileDisplayPrefs): BioLocale[] {
  return BIO_LOCALES.filter((l) => Boolean(prefs[BIO_KEY[l]]));
}

/**
 * Bio in de gevraagde taal, met auto-detect: gevraagde taal → EN → eerste
 * ingevulde vertaling → de klassieke `profiles.bio`.
 */
export function bioForLocale(
  prefs: ProfileDisplayPrefs,
  fallback: string | null | undefined,
  locale: string,
): string | null {
  const wanted = (BIO_LOCALES as readonly string[]).includes(locale) ? (locale as BioLocale) : null;
  if (wanted && prefs[BIO_KEY[wanted]]) return prefs[BIO_KEY[wanted]];
  if (prefs.bioEn) return prefs.bioEn;
  const first = availableBioLocales(prefs)[0];
  if (first) return prefs[BIO_KEY[first]];
  return fallback?.trim() || null;
}


/** Normalizes the stored layer JSON; returns "" when nothing is set. */
export function normalizeLayersPref(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  const layers = normalizeDesignLayers(raw);
  return isEmptyLayers(layers) ? "" : serializeDesignLayers(layers);
}
