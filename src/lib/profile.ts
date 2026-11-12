import { isReservedName } from "./reserved-brands";
/**
 * ROUT Profile & Link Hub — data model for the public rout.be/@handle page.
 * Kept deliberately small: handle + identity + an ordered list of blocks.
 */
import { handleRuleMessage, type HandleRuleContext } from "./handle-rules";
import type { PublicSocialLink } from "./social-verify";
import { verifiedHandleError } from "./verified-handle";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { isVisualWidget } from "./profile-widgets";
import { isProfileSectionKind } from "./profile-section-blocks";

export interface ProfileBlock {
  id: string;
  kind: string;
  label: string;
  value: string;
  hidden?: boolean;
  /** Promo/featured: badgetekst zoals "🔥 NIEUW" of "⚡ 20% KORTING". */
  badge?: string;
  /** Promo/featured: ISO-datum waarop de actie afloopt (aftelklok). */
  expiresAt?: string;
  /** Planning: ISO-datum vanaf wanneer het blok publiek zichtbaar wordt. */
  startsAt?: string;
  /** Eigen miniatuur (data-URL of https) in plaats van het merkicoon. */
  thumbnailUrl?: string;
  /** Vastgezet: verschijnt bovenaan de publieke lijst. */
  pinned?: boolean;
  /** Eigen links: favicon van de website (standaard) of een universele wereldbol. */
  iconMode?: "favicon" | "globe";
  /** Context-aware rendering: when the block may show. Default always_visible. */
  visibilityRule?: BlockVisibilityRule;
  /** Pro/Social switch: Global blocks always show. Default global. */
  contextTag?: BlockContextTag;
  /** Live component (`kind: "live"`, value = provider): which stats to show. */
  stats?: string[];
  /** Omni presentation metadata stays on this same revisioned block. */
  contentType?: "link" | "article" | "podcast" | "media";
  kineticTheme?: "aurora" | "glass";
  /** Optional bento tile size; absent = the classic full-width row. */
  size?: BlockSize;
  /** Plain links: show as a button row, as a logo under the bio, or both. Absent = follow the profile-wide link display. */
  display?: LinkDisplay;
}

export type LinkDisplay = "button" | "icon" | "both";
export type ProfileLinkMode = "rows" | "icons" | "both";
export function blockDisplay(b: Pick<ProfileBlock, "display">, profileMode: ProfileLinkMode): { button: boolean; icon: boolean } {
  const d = b.display ?? (profileMode === "rows" ? "button" : profileMode === "icons" ? "icon" : "both");
  return { button: d !== "icon", icon: d !== "button" };
}

/** The per-link choice the editor shows: the link's own choice or the profile-wide default. */
export function effectiveLinkDisplay(b: Pick<ProfileBlock, "display">, profileMode: ProfileLinkMode): LinkDisplay {
  const { button, icon } = blockDisplay(b, profileMode);
  return button && icon ? "both" : icon ? "icon" : "button";
}

/** Profile-wide link display: the Design layers choice, else derived from the legacy button shape. */
export function resolveLinkMode(linkDisplay: ProfileLinkMode | undefined, buttonShape: string | undefined): ProfileLinkMode {
  return linkDisplay ?? (buttonShape === "icon" ? "icons" : buttonShape === "bar" ? "rows" : "both");
}

const NON_LINK_KINDS = new Set(["feedback", "live", "spacer", "text", "event_list", "newsletter", "booking_request", "faq_accordion", "map_embed", "vcard", "contact_form"]);

/** Kinds that render as an ordinary outbound link (button or logo). */
export function isPlainLinkKind(kind: string): boolean {
  return !kind.startsWith("widget:") && !NON_LINK_KINDS.has(kind) && !isPromoBlock(kind) && !isWidgetBlock(kind) && !isProfileSectionKind(kind);
}

/** How many visible links currently show as a logo in the bar under the bio. */
export function countLogoLinks(blocks: readonly ProfileBlock[], profileMode: ProfileLinkMode): number {
  return blocks.filter((b) => !b.hidden && b.value.trim() !== "" && isPlainLinkKind(b.kind) && blockDisplay(b, profileMode).icon).length;
}

/** Logo bar guidance: a hint from the 4th logo, the wrap/scroll choice from the 6th. */
export const LOGO_BAR_HINT_FROM = 4;
export const LOGO_BAR_CHOICE_FROM = 6;
export function logoBarStage(count: number): "calm" | "hint" | "choose" {
  if (count >= LOGO_BAR_CHOICE_FROM) return "choose";
  if (count >= LOGO_BAR_HINT_FROM) return "hint";
  return "calm";
}

/** Wrap/scroll only applies once the bar holds more than 5 logos. */
export function logoBarLayout(count: number, mode: "wrap" | "scroll" | undefined): "wrap" | "scroll" {
  return count >= LOGO_BAR_CHOICE_FROM && mode === "scroll" ? "scroll" : "wrap";
}

export type BlockSize = "small" | "wide" | "large";
export const BLOCK_SIZES: readonly BlockSize[] = ["small", "wide", "large"];

/** Archived = switched off or past its end date; still kept, just not shown. */
export function isArchivedBlock(block: Pick<ProfileBlock, "hidden" | "expiresAt">, now: number = Date.now()): boolean {
  if (block.hidden) return true;
  if (!block.expiresAt) return false;
  const end = Date.parse(block.expiresAt);
  return Number.isFinite(end) && end <= now;
}

/** Restoring an archived block: visible again and an elapsed end date is cleared. */
export function restoreArchivedBlock<T extends Pick<ProfileBlock, "hidden" | "expiresAt">>(block: T, now: number = Date.now()): T {
  const end = block.expiresAt ? Date.parse(block.expiresAt) : NaN;
  const { expiresAt: _expired, ...rest } = block;
  return (Number.isFinite(end) && end <= now ? { ...rest, hidden: false } : { ...block, hidden: false }) as T;
}

/** Countdown block value: an ISO target moment. Returns null when unreadable. */
export function countdownTarget(value: string): number | null {
  const t = Date.parse(value.trim());
  return Number.isFinite(t) ? t : null;
}

/** Remaining time split for display; all zero once the moment passed. */
export function countdownParts(target: number, now: number = Date.now()) {
  const ms = Math.max(0, target - now);
  const s = Math.floor(ms / 1000);
  return { done: ms === 0, days: Math.floor(s / 86_400), hours: Math.floor((s % 86_400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export type BlockVisibilityRule = "always_visible" | "hide_when_focus_mode" | "show_only_when_live";
export type BlockContextTag = "global" | "professional" | "social";
export type ProfileContext = "professional" | "social";

/** Live state of the owner, as far as the visibility rules care. */
export interface LiveState {
  /** Status dot is "focus" or "dnd". */
  focus: boolean;
  /** Status dot is "online". */
  live: boolean;
}

export function liveStateFromPresence(presence: string | null | undefined): LiveState {
  return { focus: presence === "focus" || presence === "dnd", live: presence === "online" };
}

/** Drops blocks whose visibility rule doesn't match the owner's live state. */
export function applyVisibilityRules<T extends Pick<ProfileBlock, "visibilityRule">>(blocks: T[], state: LiveState): T[] {
  return blocks.filter((b) => {
    if (b.visibilityRule === "hide_when_focus_mode") return !state.focus;
    if (b.visibilityRule === "show_only_when_live") return state.live;
    return true;
  });
}

/** Pro/Social view: Global blocks always, others only in their own context. */
export function filterByContext<T extends Pick<ProfileBlock, "contextTag">>(blocks: T[], context: ProfileContext | null): T[] {
  if (!context) return blocks;
  return blocks.filter((b) => !b.contextTag || b.contextTag === "global" || b.contextTag === context);
}

/**
 * Publieke volgorde en zichtbaarheid van blokken.
 *
 * Verborgen blokken vallen weg, geplande blokken alleen binnen hun venster
 * (`startsAt` … `expiresAt`) en vastgezette blokken staan altijd bovenaan.
 */
export function scheduledBlocks(blocks: ProfileBlock[], now: number = Date.now()): ProfileBlock[] {
  const inWindow = (b: ProfileBlock) => {
    const start = b.startsAt ? Date.parse(b.startsAt) : NaN;
    const end = b.expiresAt ? Date.parse(b.expiresAt) : NaN;
    if (Number.isFinite(start) && now < start) return false;
    if (Number.isFinite(end) && now > end) return false;
    return true;
  };
  const visible = blocks.filter((b) => !b.hidden && inWindow(b));
  return [...visible.filter((b) => b.pinned), ...visible.filter((b) => !b.pinned)];
}

/** Earliest future start/expiry moment (ms) among blocks, or null when nothing is pending. */
export function nextScheduleBoundary(blocks: Pick<ProfileBlock, "startsAt" | "expiresAt" | "hidden">[], now: number = Date.now()): number | null {
  let next: number | null = null;
  for (const b of blocks) {
    if (b.hidden) continue;
    for (const raw of [b.startsAt, b.expiresAt]) {
      const at = raw ? Date.parse(raw) : NaN;
      if (Number.isFinite(at) && at > now && (next === null || at < next)) next = at;
    }
  }
  return next;
}

/** ISO moment → value for a `datetime-local` input, in the editor's own time zone. */
export function toLocalDateTimeInput(iso: string | null | undefined): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value → ISO string; "" clears, null means the value is not a real date. */
export function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return "";
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** A schedule window is valid unless both ends are set and the end is not after the start. */
export function isValidScheduleWindow(startsAt: string | null | undefined, expiresAt: string | null | undefined): boolean {
  const start = startsAt ? Date.parse(startsAt) : NaN;
  const end = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  return end > start;
}

/** Zet een ingetypt webadres om naar een volledige https-URL. */
export function sanitizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^(https?:|mailto:|tel:|bitcoin:|lightning:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(value)) return `https://${value}`;
  return value;
}

/** Kant-en-klare badges voor het promo/featured-component. */
export const PROMO_BADGE_PRESETS = [
  "🔥 NIEUW",
  "⚡ 20% KORTING",
  "🎙️ LAATSTE AFLEVERING",
  "⏳ TIJDELIJK",
  "🎁 CADEAU",
] as const;

/** Copy-voorzetjes zodat de titel actiegericht blijft. */
export const PROMO_COPY_PRESETS = [
  "Lees mijn nieuwste blog over…",
  "Claim 10% korting op…",
  "Beluister aflevering #…",
  "Bekijk mijn nieuwste aanbod",
] as const;

export const isPromoBlock = (kind: string) => kind === "promo";

export interface ProfileRecord {
  fediverse?: { url: string; verified: boolean } | null;
  id: string;
  username: string | null;
  display_name: string | null;
  tagline: string | null;
  avatar_url: string | null;
  favicon_url?: string | null;
  theme: string;
  card_style: string;
  blocks: ProfileBlock[];
  tier?: string;
  verified?: boolean;
  /** Aliasprofiel (`/u/…`) van een lid met een geverifieerd rootprofiel. */
  human_linked?: boolean;
  /** Tier 2: legal name verified from a government document (or legacy paid verification). */
  legal_identity_verified?: boolean;
  /** Tier 1: proven unique human (pseudonym-safe). */
  real_human_verified?: boolean;
  /** Server-signed Account Genesis stamp (HMAC of id + creation time). */
  genesis_stamp?: string | null;
  created_at_iso?: string | null;
  early_believer_id?: string | null;
  early_believer_at?: string | null;
  /** Server-side afgeleid van de eigenaar, los van het identiteitsvinkje. */
  is_pro?: boolean;
  /** Goedgekeurd bedrijf: zwarte badge, pagina op de officiële domeinnaam. */
  is_business?: boolean;
  business_name?: string | null;
  business_vat?: string | null;
  /** Goedgekeurde influencer: roze badge. */
  is_influencer?: boolean;
  status?: string;
  bio?: string | null;
  profile_descriptions?: Partial<Record<"nl" | "en" | "fr" | "de", string>>;
  is_early_believer?: boolean;
  show_email_publicly?: boolean;
  forwarding_email?: string | null;
  custom_domain?: string | null;
  created_at?: string | null;
  /** Moment waarop de verificatie is geactiveerd (blauwe badge-popover). */
  verified_at?: string | null;
  /** Weergavevoorkeuren (badge, watermerk, achtergrond) — zie profile-display.ts. */
  display_prefs?: unknown;
  verified_legal_name?: string | null;
  /** ISO 3166-1 alpha-2 land van het geverifieerde lid (bv. "BE"). */
  country_code?: string | null;
  /** Geclaimde rootnaam — een via DNS geverifieerd domein mag hier staan. */
  subdomain_alias?: string | null;
  /**
   * Geverifieerde sociale accounts met gecachte volgeraantallen. Deze data komt
   * uitsluitend uit onze database (`social_links`), nooit uit een externe API
   * tijdens het laden van de profielpagina.
   */
  social_links?: PublicSocialLink[];
  /** Totaal bereik-badge: gecacht totaal over alle sociale accounts. */
  show_total_reach?: boolean;
  total_reach_count?: number;
}

export type ProfileTier = "free" | "early_believer";

export interface PaymentMethodOption {
  id: "stripe" | "sepa";
  label: string;
  note: string;
  instant: boolean;
}

/** One-time Early Believer verification — price locked for life. */
export const EARLY_BELIEVER_CENTS = 399;

/** Optional recurring "Keep ROUT Alive" add-ons on top of the one-time fee. */
export type DonationPlan = "none" | "one_time" | "monthly" | "yearly";

export const DONATION_PLANS: {
  id: DonationPlan;
  label: string;
  note: string;
  cents: number;
  interval: "month" | "year" | null;
}[] = [
  {
    id: "none",
    label: "No extra donation",
    note: `Total: ${"\u20AC"}3.99`,
    cents: 0,
    interval: null,
  },
  {
    id: "one_time",
    label: "One-off extra",
    note: "From €1.00 extra",
    cents: 100,
    interval: null,
  },
  {
    id: "monthly",
    label: "€1.00 / month",
    note: "Minimum — set your own",
    cents: 100,
    interval: "month",
  },
  {
    id: "yearly",
    label: "€12.00 / year",
    note: "Minimum — set your own",
    cents: 1200,
    interval: "year",
  },
];

/** Verification tiers — price in cents, one-off. */
export const VERIFICATION_TIERS: {
  id: Exclude<ProfileTier, "free">;
  label: string;
  amountCents: number;
  instantSurchargeCents: number;
  audience: string;
  perks: string[];
  methods: PaymentMethodOption[];
}[] = [
  {
    id: "early_believer",
    label: "Early Believer",
    amountCents: EARLY_BELIEVER_CENTS,
    instantSurchargeCents: 0,
    audience: "One-time lifetime verification — price locked for life",
    perks: [
      "Verified Early Believer badge on your profile",
      "Your own username@rout.be forwarding address",
      "Custom domain mapping",
      "Priority on new sovereign features",
    ],
    methods: [
      {
        id: "stripe",
        label: "Instant via card",
        note: "Active immediately after payment — €3.99 one-time.",
        instant: true,
      },
      {
        id: "sepa",
        label: "Bank transfer (SEPA)",
        note: "€3.99 one-time — manual matching, 1 to 2 weeks.",
        instant: false,
      },
    ],
  },
];

/**
 * Official SEPA bank details for the manual bank-transfer route.
 * Belgian Wise account — single source of truth for every payment view.
 */
export const SEPA_DETAILS = {
  beneficiary: "Jona Zeno De Smet",
  iban: "BE78 9677 2106 1586",
  bic: "TRWIBEB1XXX",
  bank: "Wise",
  bankAddress: "Rue du Trône 100, 1050 Brussels, Belgium",
  country: "België",
};

export const RESERVED_HANDLES = [
  "admin",
  "api",
  "auth",
  "free",
  "u",
  "login",
  "logout",
  "settings",
  "support",
  "dashboard",
  "root",
  "rout",
  "www",
  "mail",
  "help",
  "billing",
  "status",
  "static",
  "assets",
  "cdn",
  "app",
  "go",
  "r",
  "card",
  "hub",
  "stats",
  "privacy",
  "terms",
  "batch",
  "en",
  "nl",
  "me",
  "user",
  "users",
  "profile",
  "security",
  "verify",
  "payment",
  "payments",
  "webhook",
  "webhooks",
  "null",
  "undefined",
  // Top-level app routes — a handle here would shadow a real page in the
  // clean `rout.be/<handle>` namespace.
  "claim",
  "studio",
  "contact",
  "manifesto",
  "sovereignty",
  "self-hosting",
  "signature",
  "email-templates",
  "iban-qr",
  "vcard-qr",
  "wifi-qr",
  "s",
  "dev",
];

export const isReservedHandle = (h: string) => RESERVED_HANDLES.includes(h) || isReservedName(h).reserved;

/**
 * Public path for a profile: eigen namespace bij verificatie, anders `/u/`.
 * Zonder `@` — de routes accepteren beide vormen, maar we tonen en delen de
 * schone variant (`rout.be/u/jona`).
 */
export const profilePath = (username: string, verified?: boolean) =>
  verified ? `/${username}` : `/u/${username}`;

export type SocialTag = "sovereign" | "popular" | "video" | "chat" | "work";
const SOCIAL_TAGS: Record<string, SocialTag[]> = {
  eyou: ["sovereign"], wsocial: ["sovereign"], mastodon: ["sovereign"], matrix: ["sovereign", "chat"], signal: ["sovereign", "chat"], pixelfed: ["sovereign"], bluesky: ["sovereign", "popular"], peertube: ["sovereign", "video"], lemmy: ["sovereign"], misskey: ["sovereign"],
  instagram: ["popular"], tiktok: ["popular", "video"], x: ["popular"], facebook: ["popular"], youtube: ["popular", "video"], snapchat: ["popular", "chat"], threads: ["popular"], reddit: ["popular"], pinterest: ["popular"], tumblr: ["popular"],
  vimeo: ["video"], dailymotion: ["video"], twitch: ["video"], kick: ["video"], telegram: ["chat"], whatsapp: ["chat"], discord: ["chat"], viber: ["chat"], steam: ["chat"],
  linkedin: ["work"], github: ["work"], gitlab: ["work"], behance: ["work"], dribbble: ["work"], patreon: ["work"], kofi: ["work"], substack: ["work"], spotify_artist: ["work"], soundcloud: ["work"],
};

/** Block catalogue used by the “+ Add block” drawer, grouped in folders. */
export const BLOCK_KINDS: {
  kind: string;
  label: string;
  category: "featured" | "socials" | "web" | "finance" | "media" | "contact" | "layout";
  placeholder: string;
  /** Turns a handle into a full URL. */
  base?: string;
  tags?: readonly SocialTag[];
}[] = [
  // 1 — Soeverein & Fediverse (top-alternatieven eerst)
  {
    kind: "eyou",
    label: "Eyou.social",
    category: "featured" as const,
    placeholder: "routbe",
    base: "https://eyou.social/u/",
  },
  {
    kind: "wsocial",
    label: "wsocial.eu",
    category: "featured" as const,
    placeholder: "@gebruikersnaam",
    base: "https://wsocial.eu/profile/",
  },
  {
    kind: "mastodon",
    label: "Mastodon",
    category: "featured" as const,
    placeholder: "https://mastodon.social/@routbe",
  },
  {
    kind: "matrix",
    label: "Matrix",
    category: "featured" as const,
    placeholder: "@jona:matrix.org",
    base: "https://matrix.to/#/",
  },
  { kind: "signal", label: "Signal", category: "featured" as const, placeholder: "https://signal.me/#p/…" },
  {
    kind: "bluesky",
    label: "Bluesky",
    category: "featured" as const,
    placeholder: "rout.be",
    base: "https://bsky.app/profile/",
  },
  {
    kind: "pixelfed",
    label: "Pixelfed",
    category: "featured" as const,
    placeholder: "https://pixelfed.social/jona",
  },
  {
    kind: "substack",
    label: "Substack",
    category: "featured" as const,
    placeholder: "https://jona.substack.com",
  },

  { kind: "tumblr", label: "Tumblr", category: "socials" as const, placeholder: "jona", base: "https://www.tumblr.com/" },
  { kind: "vimeo", label: "Vimeo", category: "socials" as const, placeholder: "jona", base: "https://vimeo.com/" },
  { kind: "dailymotion", label: "Dailymotion", category: "socials" as const, placeholder: "jona", base: "https://www.dailymotion.com/" },
  { kind: "peertube", label: "PeerTube", category: "socials" as const, placeholder: "https://video.example.org/c/jona" },
  { kind: "lemmy", label: "Lemmy", category: "socials" as const, placeholder: "https://lemmy.world/u/jona" },
  { kind: "misskey", label: "Misskey", category: "socials" as const, placeholder: "https://misskey.io/@jona" },
  { kind: "spotify_artist", label: "Spotify (artist)", category: "socials" as const, placeholder: "artist-id", base: "https://open.spotify.com/artist/" },
  { kind: "viber", label: "Viber", category: "socials" as const, placeholder: "+32470000000", base: "viber://chat?number=" },
  // 2 — Mainstream socials & communities
  {
    kind: "instagram",
    label: "Instagram",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://instagram.com/",
  },
  {
    kind: "tiktok",
    label: "TikTok",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://tiktok.com/@",
  },
  {
    kind: "x",
    label: "X / Twitter",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://x.com/",
  },
  {
    kind: "youtube",
    label: "YouTube",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://youtube.com/@",
  },
  {
    kind: "linkedin",
    label: "LinkedIn",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://linkedin.com/in/",
  },
  {
    kind: "facebook",
    label: "Facebook",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://facebook.com/",
  },
  {
    kind: "snapchat",
    label: "Snapchat",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://snapchat.com/add/",
  },
  {
    kind: "pinterest",
    label: "Pinterest",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://pinterest.com/",
  },
  {
    kind: "reddit",
    label: "Reddit",
    category: "socials" as const,
    placeholder: "u/jona",
    base: "https://reddit.com/",
  },
  {
    kind: "threads",
    label: "Threads",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://threads.net/@",
  },
  {
    kind: "twitch",
    label: "Twitch",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://twitch.tv/",
  },
  {
    kind: "kick",
    label: "Kick",
    category: "socials" as const,
    placeholder: "jona",
    base: "https://kick.com/",
  },
  {
    kind: "telegram",
    label: "Telegram",
    category: "socials" as const,
    placeholder: "@jona",
    base: "https://t.me/",
  },
  { kind: "whatsapp", label: "WhatsApp", category: "socials" as const, placeholder: "+32 470 00 00 00" },
  { kind: "discord", label: "Discord", category: "socials" as const, placeholder: "https://discord.gg/…" },
  {
    kind: "vk",
    label: "VKontakte",
    category: "socials" as const,
    placeholder: "jona",
    base: "https://vk.com/",
  },

  // 3 — Developer, web & portfolios
  { kind: "website", label: "Website / URL", category: "web" as const, placeholder: "https://rout.be" },
  {
    kind: "github",
    label: "GitHub",
    category: "web" as const,
    placeholder: "@jona",
    base: "https://github.com/",
  },
  {
    kind: "gitlab",
    label: "GitLab",
    category: "web" as const,
    placeholder: "@jona",
    base: "https://gitlab.com/",
  },
  {
    kind: "stackoverflow",
    label: "Stack Overflow",
    category: "web" as const,
    placeholder: "https://stackoverflow.com/users/…",
  },
  {
    kind: "dribbble",
    label: "Dribbble",
    category: "web" as const,
    placeholder: "@jona",
    base: "https://dribbble.com/",
  },
  {
    kind: "behance",
    label: "Behance",
    category: "web" as const,
    placeholder: "@jona",
    base: "https://behance.net/",
  },
  {
    kind: "codepen",
    label: "CodePen",
    category: "web" as const,
    placeholder: "jona",
    base: "https://codepen.io/",
  },
  { kind: "notion", label: "Notion", category: "web" as const, placeholder: "https://notion.site/…" },
  {
    kind: "readcv",
    label: "Read.cv",
    category: "web" as const,
    placeholder: "@jona",
    base: "https://read.cv/",
  },
  {
    kind: "hashnode",
    label: "Hashnode",
    category: "web" as const,
    placeholder: "https://jona.hashnode.dev",
  },
  {
    kind: "wikipedia",
    label: "Wikipedia",
    category: "web" as const,
    placeholder: "https://nl.wikipedia.org/wiki/…",
  },

  // 4 — Financiën, betalingen & crypto
  {
    kind: "paypal",
    label: "PayPal",
    category: "finance" as const,
    placeholder: "@jona",
    base: "https://paypal.me/",
  },
  {
    kind: "stripe",
    label: "Stripe payment link",
    category: "finance" as const,
    placeholder: "https://buy.stripe.com/…",
  },
  {
    kind: "revolut",
    label: "Revolut",
    category: "finance" as const,
    placeholder: "@jona",
    base: "https://revolut.me/",
  },
  { kind: "bancontact", label: "Bancontact", category: "finance" as const, placeholder: "https://…" },
  {
    kind: "payconiq",
    label: "Payconiq",
    category: "finance" as const,
    placeholder: "https://payconiq.com/…",
  },
  { kind: "tikkie", label: "Tikkie", category: "finance" as const, placeholder: "https://tikkie.me/pay/…" },
  {
    kind: "opencollective",
    label: "Open Collective",
    category: "finance" as const,
    placeholder: "jona",
    base: "https://opencollective.com/",
  },
  {
    kind: "kofi",
    label: "Ko-fi",
    category: "finance" as const,
    placeholder: "jona",
    base: "https://ko-fi.com/",
  },
  {
    kind: "bmac",
    label: "Buy Me a Coffee",
    category: "finance" as const,
    placeholder: "jona",
    base: "https://buymeacoffee.com/",
  },
  {
    kind: "patreon",
    label: "Patreon",
    category: "finance" as const,
    placeholder: "jona",
    base: "https://patreon.com/",
  },
  {
    kind: "lightning",
    label: "Bitcoin Lightning address",
    category: "finance" as const,
    placeholder: "jona@getalby.com",
  },
  { kind: "evm", label: "EVM wallet (ETH/Polygon)", category: "finance" as const, placeholder: "0x…" },

  // 5 — Media, gaming & entertainment
  {
    kind: "spotify",
    label: "Spotify",
    category: "media" as const,
    placeholder: "https://open.spotify.com/…",
  },
  {
    kind: "applemusic",
    label: "Apple Music",
    category: "media" as const,
    placeholder: "https://music.apple.com/…",
  },
  {
    kind: "soundcloud",
    label: "SoundCloud",
    category: "media" as const,
    placeholder: "jona",
    base: "https://soundcloud.com/",
  },
  {
    kind: "bandcamp",
    label: "Bandcamp",
    category: "media" as const,
    placeholder: "https://jona.bandcamp.com",
  },
  { kind: "tidal", label: "Tidal", category: "media" as const, placeholder: "https://tidal.com/…" },
  { kind: "deezer", label: "Deezer", category: "media" as const, placeholder: "https://deezer.com/…" },
  {
    kind: "lastfm",
    label: "Last.fm",
    category: "media" as const,
    placeholder: "jona",
    base: "https://last.fm/user/",
  },
  {
    kind: "steam",
    label: "Steam",
    category: "media" as const,
    placeholder: "https://steamcommunity.com/id/jona",
  },
  { kind: "epicgames", label: "Epic Games", category: "media" as const, placeholder: "jona" },
  {
    kind: "letterboxd",
    label: "Letterboxd",
    category: "media" as const,
    placeholder: "jona",
    base: "https://letterboxd.com/",
  },
  {
    kind: "goodreads",
    label: "Goodreads",
    category: "media" as const,
    placeholder: "https://goodreads.com/…",
  },
  { kind: "imdb", label: "IMDb", category: "media" as const, placeholder: "https://imdb.com/name/…" },
  {
    kind: "myanimelist",
    label: "MyAnimeList",
    category: "media" as const,
    placeholder: "jona",
    base: "https://myanimelist.net/profile/",
  },
  {
    kind: "trakt",
    label: "Trakt",
    category: "media" as const,
    placeholder: "jona",
    base: "https://trakt.tv/users/",
  },

  // 6 — Bedrijf, contact & utilities
  {
    kind: "vcard",
    label: "vCard (direct download)",
    category: "contact" as const,
    placeholder: "https://…/contact.vcf",
  },
  { kind: "email", label: "E-mailadres", category: "contact" as const, placeholder: "hello@rout.be" },
  { kind: "phone", label: "Telefoonnummer", category: "contact" as const, placeholder: "+32 470 00 00 00" },
  {
    kind: "whatsapp_chat",
    label: "WhatsApp direct chat",
    category: "contact" as const,
    placeholder: "+32 470 00 00 00",
  },
  {
    kind: "location",
    label: "Google Maps / locatie",
    category: "contact" as const,
    placeholder: "Grote Markt 1, 8500 Kortrijk",
  },
  {
    kind: "applemaps",
    label: "Apple Maps",
    category: "contact" as const,
    placeholder: "https://maps.apple.com/?q=…",
  },
  {
    kind: "calcom",
    label: "Cal.com",
    category: "contact" as const,
    placeholder: "jona",
    base: "https://cal.com/",
  },
  {
    kind: "calendly",
    label: "Calendly",
    category: "contact" as const,
    placeholder: "jona",
    base: "https://calendly.com/",
  },
  { kind: "wifi", label: "Wi-Fi netwerk", category: "contact" as const, placeholder: "SSID · wachtwoord" },
  {
    kind: "trustpilot",
    label: "Trustpilot",
    category: "contact" as const,
    placeholder: "https://trustpilot.com/review/…",
  },
  { kind: "yelp", label: "Yelp", category: "contact" as const, placeholder: "https://yelp.com/biz/…" },
  {
    kind: "booking",
    label: "Booking.com",
    category: "contact" as const,
    placeholder: "https://booking.com/hotel/…",
  },
  { kind: "shop", label: "Shop", category: "contact" as const, placeholder: "https://shop.rout.be" },
  { kind: "link", label: "Eigen link", category: "contact" as const, placeholder: "https://…" },
  // Interactieve widgets: deze renderen als kaart op het profiel i.p.v. als link.
  {
    kind: "newsletter",
    label: "Nieuwsbrief (inschrijfformulier)",
    category: "web" as const,
    placeholder: "Blijf op de hoogte",
  },
  {
    kind: "calendar",
    label: "Afspraak boeken (Cal.com / Calendly)",
    category: "web" as const,
    placeholder: "https://cal.com/jouwnaam/30min",
  },
  {
    kind: "booking_request",
    label: "Booking / Afspraak (ROUT native)",
    category: "contact" as const,
    placeholder: "Plan een afspraak / gesprek",
  },
  {
    kind: "media_gallery",
    label: "Galerij / Media (ROUT native)",
    category: "media" as const,
    placeholder: "Mijn galerij",
  },
  {
    kind: "social_grid",
    label: "Social Grid (ROUT native)",
    category: "media" as const,
    placeholder: "Mijn grid",
  },
  {
    kind: "social_feed",
    label: "Bluesky / Mastodon posts",
    category: "media" as const,
    placeholder: "Automatische posts",
  },
  {
    kind: "media_embed",
    label: "Video, Muziek & Documenten",
    category: "media" as const,
    placeholder: "Plak een YouTube-, Spotify- of PDF-link…",
  },
  {
    kind: "audio_player",
    label: "Audio-speler (universeel)",
    category: "media" as const,
    placeholder: "Link naar een audiobestand",
  },
  {
    kind: "contact_form",
    label: "Contactformulier / E-mailcapture (ROUT native)",
    category: "contact" as const,
    placeholder: "Neem contact op",
  },
  { kind: "feedback", label: "Feedback-kaart", category: "contact" as const, placeholder: "" },
  {
    kind: "live_poll",
    label: "Interactieve poll",
    category: "web" as const,
    placeholder: "Welk project moet ik eerst bouwen?",
  },
  {
    kind: "vcard",
    label: "vCard / Visitekaartje",
    category: "contact" as const,
    placeholder: "Contact opslaan",
  },
  {
    kind: "faq_accordion",
    label: "FAQ / Veelgestelde vragen",
    category: "layout" as const,
    placeholder: "Veelgestelde vragen",
  },
  {
    kind: "map_embed",
    label: "Locatie & kaart",
    category: "contact" as const,
    placeholder: "Grote Markt, Brussel",
  },
  {
    kind: "event_list",
    label: "Evenementen / Agenda (ROUT native)",
    category: "web" as const,
    placeholder: "Aankomende evenementen",
  },
  {
    kind: "promo",
    label: "Promo / Featured link",
    category: "contact" as const,
    placeholder: "https://…",
  },

  // Layout-elementen: geen link, alleen visuele structuur op het profiel.
  {
    kind: "text",
    label: "Tekstblok",
    category: "layout" as const,
    placeholder: "Schrijf een korte tekst…",
  },
  {
    kind: "countdown",
    label: "Aftelklok",
    category: "layout" as const,
    placeholder: "2026-12-31T20:00",
  },
  {
    kind: "spacer",
    label: "Spacer / witruimte",
    category: "layout" as const,
    placeholder: "",
  },
].map((platform) => ({ ...platform, tags: SOCIAL_TAGS[platform.kind] ?? [] }));

/**
 * Curated “+ Add component” tabs: vier high-value groepen bovenop de
 * klassieke categorieën. Elke tab wijst naar bestaande block kinds.
 */
export const BLOCK_TABS: {
  id: string;
  label: string;
  description: string;
  kinds: string[];
}[] = [
  {
    id: "standard",
    label: "⚡ Standaard & Embeds",
    description: "Smart links, universele embeds en opmaak",
    kinds: [
      "link",
      "website",
      "media_embed",
      "audio_player",
      "media_gallery",
      "social_grid",
      "text",
      "spacer",
      "countdown",
      "youtube",
      "spotify",
      "soundcloud",
    ],
  },
  {
    id: "sovereign",
    label: "🌐 Soeverein & Sociaal",
    description: "Fediverse, socials en eigen kanalen",
    kinds: [
      "eyou",
      "wsocial",
      "bluesky",
      "mastodon",
      "matrix",
      "signal",
      "pixelfed",
      "substack",
      "instagram",
      "tiktok",
      "x",
      "github",
    ],
  },
  {
    id: "microapps",
    label: "🧰 Native Micro-apps",
    description: "Boekingen, contact en e-mailcapture",
    kinds: [
      "booking_request",
      "contact_form",
      "feedback",
      "event_list",
      "live_poll",
      "faq_accordion",
      "map_embed",
      "calendar",
      "calcom",
      "calendly",
      "vcard",
      "newsletter",
    ],
  },
  {
    id: "commerce",
    label: "💳 Commerce & Donaties",
    description: "Tips, donaties en productshowcases",
    kinds: [
      "kofi",
      "bmac",
      "patreon",
      "opencollective",
      "paypal",
      "stripe",
      "tikkie",
      "shop",
      "promo",
    ],
  },
];

export const BLOCK_CATEGORIES = [
  { id: "featured", label: "Soeverein & Fediverse" },
  { id: "web", label: "Code & open source" },
  { id: "socials", label: "Mainstream" },
  { id: "finance", label: "Financiën" },
  { id: "media", label: "Media & gaming" },
  { id: "contact", label: "Contact & utilities" },
  { id: "layout", label: "Layout & tekst" },
] as const;

/**
 * Merk-accentkleuren per componenttype — vlakke tinten, geen gradients.
 * Gebruikt voor de visuele kaartjes in de Studio zodat de lijst leesbaar blijft.
 */
export const BLOCK_BRAND: Record<string, string> = {
  eyou: "#16a34a",
  wsocial: "#0ea5a4",
  bluesky: "#0285ff",
  mastodon: "#6364ff",
  pixelfed: "#10b981",
  matrix: "#0f172a",
  signal: "#3a76f0",
  substack: "#ff6719",
  instagram: "#d62976",
  tiktok: "#010101",
  x: "#111111",
  youtube: "#ff0000",
  linkedin: "#0a66c2",
  facebook: "#1877f2",
  snapchat: "#f7c800",
  pinterest: "#e60023",
  reddit: "#ff4500",
  threads: "#111111",
  twitch: "#9146ff",
  kick: "#53fc18",
  telegram: "#229ed9",
  whatsapp: "#25d366",
  whatsapp_chat: "#25d366",
  discord: "#5865f2",
  vk: "#0077ff",
  website: "#0f172a",
  github: "#181717",
  gitlab: "#fc6d26",
  stackoverflow: "#f48024",
  dribbble: "#ea4c89",
  behance: "#1769ff",
  codepen: "#111111",
  notion: "#111111",
  readcv: "#111111",
  hashnode: "#2962ff",
  wikipedia: "#3366cc",
  paypal: "#003087",
  stripe: "#635bff",
  revolut: "#111111",
  bancontact: "#004e9e",
  payconiq: "#ff4785",
  tikkie: "#f57c00",
  opencollective: "#297eff",
  kofi: "#ff5e5b",
  bmac: "#ffdd00",
  patreon: "#ff424d",
  lightning: "#f7931a",
  evm: "#627eea",
  spotify: "#1db954",
  applemusic: "#fa233b",
  soundcloud: "#ff5500",
  bandcamp: "#629aa9",
  tidal: "#111111",
  deezer: "#a238ff",
  lastfm: "#d51007",
  steam: "#1b2838",
  epicgames: "#2a2a2a",
  letterboxd: "#00e054",
  goodreads: "#553b08",
  imdb: "#f5c518",
  myanimelist: "#2e51a2",
  trakt: "#ed1c24",
  vcard: "#0f172a",
  email: "#0ea5e9",
  phone: "#16a34a",
  location: "#ea4335",
  applemaps: "#0f172a",
  calcom: "#111111",
  calendly: "#006bff",
  wifi: "#0ea5e9",
  trustpilot: "#00b67a",
  yelp: "#ff1a1a",
  booking: "#003580",
  shop: "#0f172a",
  link: "#0f172a",
};

/** Accentkleur van een component (valt terug op een neutrale tint). */
export const brandOf = (kind: string) => BLOCK_BRAND[kind] ?? "#64748b";

/** Flat UI theme presets — background / card / text tokens per theme. */
export const PROFILE_THEMES: {
  id: string;
  label: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  /** Accentkleur voor neon-knoppen en mesh-achtergronden. */
  accent?: string;
}[] = [
  {
    id: "noir",
    label: "Noir",
    bg: "#0d0d0d",
    card: "#171717",
    text: "#f5f5f5",
    muted: "#a3a3a3",
    border: "#2a2a2a",
    accent: "#e5e5e5",
  },
  {
    id: "papier",
    label: "Papier",
    bg: "#f7f4ef",
    card: "#ffffff",
    text: "#1c1917",
    muted: "#78716c",
    border: "#e3ded5",
    accent: "#1c1917",
  },
  {
    id: "midnight",
    label: "Midnight",
    bg: "#0b1220",
    card: "#141d31",
    text: "#eef2ff",
    muted: "#94a3b8",
    border: "#22304d",
    accent: "#6366f1",
  },
  {
    id: "forest",
    label: "Forest",
    bg: "#0e1a14",
    card: "#16251d",
    text: "#ecfdf5",
    muted: "#8faca0",
    border: "#22382c",
    accent: "#10b981",
  },
  {
    id: "terracotta",
    label: "Terracotta",
    bg: "#fdf3ee",
    card: "#ffffff",
    text: "#2b1a12",
    muted: "#8a6b5c",
    border: "#ecd9cd",
    accent: "#c2703f",
  },
  {
    id: "mocha",
    label: "Mocha",
    bg: "#1b1310",
    card: "#2a1e19",
    text: "#f6ece3",
    muted: "#bda695",
    border: "#3b2b23",
    accent: "#c08457",
  },
  {
    id: "slate",
    label: "Slate",
    bg: "#f1f5f9",
    card: "#ffffff",
    text: "#0f172a",
    muted: "#64748b",
    border: "#dbe3ec",
    accent: "#3b82f6",
  },
  {
    id: "emerald",
    label: "Emerald Glass",
    bg: "#04211a",
    card: "#0b3328",
    text: "#e6fff6",
    muted: "#8fc7b3",
    border: "#12513f",
    accent: "#34d399",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    bg: "#0a0a0f",
    card: "#15121f",
    text: "#f4f2ff",
    muted: "#9d95c7",
    border: "#2b2440",
    accent: "#a855f7",
  },
  {
    id: "arctic",
    label: "Arctic Frost",
    bg: "#f2f8fd",
    card: "#ffffff",
    text: "#0b2434",
    muted: "#5f7f92",
    border: "#d7e7f2",
    accent: "#38bdf8",
  },
  {
    id: "sunset",
    label: "Sunset Gold",
    bg: "#17120d",
    card: "#241a12",
    text: "#fdf3e3",
    muted: "#c4a884",
    border: "#3a2a1c",
    accent: "#f59e0b",
  },
  { id: "rout-default", label: "ROUT Default", bg: "#ffffff", card: "#ffffff", text: "#0a0a0a", muted: "#6b6b6b", border: "#e5e5e5", accent: "#0a0a0a" },
  { id: "obsidian-dark", label: "Obsidian Dark", bg: "#07080a", card: "#0f1114", text: "#fafafa", muted: "#8b8f97", border: "#24272d", accent: "#ffffff" },
  { id: "biophilic", label: "Biophilic Minimal", bg: "#efe9dd", card: "#f7f3ea", text: "#2f3a2b", muted: "#7a7f6a", border: "#d6cdb8", accent: "#5b6e47" },
  { id: "inkt", label: "Flat Hand-Drawn", bg: "#fbf8f1", card: "#fffdf8", text: "#141414", muted: "#555048", border: "#141414", accent: "#141414" },
];

export const CARD_STYLES = [
  { id: "bordered", label: "Bordered" },
  { id: "solid", label: "Solid flat" },
  { id: "pill", label: "Pill" },
  { id: "sharp", label: "Sharp" },
  { id: "glass", label: "Glass" },
  { id: "neon", label: "Neon glow" },
] as const;

export const themeOf = (id: string) => PROFILE_THEMES.find((t) => t.id === id) ?? PROFILE_THEMES[0];

/** Lowercase, url-safe handle. Never throws; returns '' when unusable. */
export function normalizeHandle(raw: string): string {
  return sanitizeHandleInput(raw)
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 30);
}

/** Minimum handle length — 5 characters is the platform-wide floor. */
export const HANDLE_MIN_LENGTH = 5;
export const HANDLE_MAX_LENGTH = 30;

export const HANDLE_RULE = "5–30 characters · lowercase letters, numbers and . - _";

/** Tier-aware hint shown under the handle input. */
export function handleRuleHint(ctx: HandleRuleContext = {}): string {
  return ctx.tier === "verified"
    ? "5–30 characters · lowercase letters, numbers and . - _ · must stay traceable to your legal name (e.g. j.delplanche)"
    : "Free handle: 5–30 characters with at least 2 numbers (e.g. jona26) · lowercase letters, numbers and . - _";
}

export const isValidHandle = (h: string) => /^[a-z0-9](?:[a-z0-9._-]{3,28}[a-z0-9])$/.test(h);

/** Human-readable reason a handle is unusable, or null when it is valid. */
export function handleIssue(h: string, ctx: HandleRuleContext = {}): string | null {
  if (!h) return "Choose a handle to claim your namespace.";
  const ruleIssue = handleRuleMessage(h, ctx);
  if (ruleIssue) return ruleIssue;
  if (h.length > HANDLE_MAX_LENGTH)
    return `Handles can be at most ${HANDLE_MAX_LENGTH} characters long.`;
  if (isReservedHandle(h)) return "That handle is reserved by the system.";
  if (!isValidHandle(h))
    return "Use lowercase letters, numbers and the separators . - _ ; start and end with a letter or number.";
  // Geverifieerde identiteit: de handle IS de naamstructuur (voornaam +
  // achternaam, één deel mag een initiaal zijn). Ook de privacy-modus ontsnapt
  // hier niet aan — het blauwe vinkje hangt aan die naam.
  if (ctx.tier === "verified" && ctx.legalName) {
    const structural = verifiedHandleError(h, ctx.legalName);
    if (structural) return structural;
  }
  return null;
}

/** Resolves a block value (handle, phone, e-mail or full URL) to an href. */
/** wsocial.eu (AT Protocol): bare names get `.wsocial.eu`; custom domains stay as typed. */
export function wsocialHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!h) return "";
  return h.includes(".") ? h : `${h}.wsocial.eu`;
}

export function blockHref(block: ProfileBlock): string {
  const raw = block.value.trim();
  if (!raw) return "";
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;

  switch (block.kind) {
    case "wsocial":
      return `https://wsocial.eu/profile/${wsocialHandle(raw)}`;
    case "email":
      return `mailto:${raw}`;
    case "lightning":
      return raw.includes("@") ? `lightning:${raw}` : raw;
    case "evm":
      return `https://etherscan.io/address/${raw}`;
    case "wifi":
    case "newsletter":
    case "booking_request":
    case "media_gallery":
    case "social_grid":
    case "media_embed":
    case "audio_player":
    case "social_feed":
    case "contact_form":
    case "feedback":
    case "live_poll":
    case "faq_accordion":
    case "vcard":
    case "map_embed":
    case "event_list":
    case "countdown":
      return "";

    case "calendar":
      return raw.startsWith("http") ? raw : `https://${raw.replace(/^\/+/, "")}`;
    case "phone":
      return `tel:${raw.replace(/[^\d+]/g, "")}`;
    case "whatsapp":
      return `https://wa.me/${raw.replace(/[^\d]/g, "")}`;
    case "location":
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;
    default: {
      const def = BLOCK_KINDS.find((k) => k.kind === block.kind);
      if (def?.base) return `${def.base}${raw.replace(/^@+/, "")}`;
      return `https://${raw.replace(/^\/+/, "")}`;
    }
  }
}

/** Blokken die als interactieve widget renderen i.p.v. als gewone linkknop. */
export const isWidgetBlock = (kind: string) =>
  kind === "feedback" ||
  kind === "newsletter" ||
  kind === "calendar" ||
  kind === "booking_request" ||
  kind === "media_gallery" ||
  kind === "social_grid" ||
  kind === "media_embed" ||
  kind === "audio_player" ||
  kind === "social_feed" ||
  kind === "contact_form" ||
  kind === "live_poll" ||
  kind === "faq_accordion" ||
  kind === "vcard" ||
  kind === "map_embed" ||
  kind === "event_list" ||
  kind === "countdown" ||
  isVisualWidget(kind);

export const newBlockId = () =>
  `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Formats cents as a Belgian euro price (€1,50). */
export const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
