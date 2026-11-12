/**
 * Harde merk-icoonkaart — geen AI-tekeningen, geen dynamische API-gokken.
 *
 * Elk platform wijst expliciet naar een geverifieerd SVG-pad en de officiële
 * merkkleur. De paden komen uit het `simple-icons`-pakket (officiële merk-
 * vectoren); alleen merken die simple-icons niet mag distribueren staan hier
 * als geverifieerde constante.
 *
 * Regel: staat een sleutel in deze map, dan rendert de UI *altijd* dat exacte
 * merkicoon in de merkkleur. Nooit een generieke wereldbol voor een bekend
 * platform. Onbekende/eigen URLs vallen terug op een neutraal link-symbool.
 */
import {
  siKick,
  siReaddotcv,
  siHashnode,
  siRevolut,
  siOpencollective,
  siBuymeacoffee,
  siApplemusic,
  siTidal,
  siLastdotfm,
  siEpicgames,
  siTrakt,
  siCaldotcom,
  siCalendly,
  siBitcoin,
  siEthereum,
  siBookingdotcom,
  siBandcamp,
  siBehance,
  siBluesky,
  siDeezer,
  siDiscord,
  siDribbble,
  siFacebook,
  siGithub,
  siGitlab,
  siGoodreads,
  siImdb,
  siInstagram,
  siKeycloak,
  siKofi,
  siLetterboxd,
  siMastodon,
  siMatrix,
  siMyanimelist,
  siNotion,
  siPatreon,
  siPaypal,
  siPinterest,
  siPixelfed,
  siReddit,
  siSignal,
  siSnapchat,
  siSoundcloud,
  siSpotify,
  siStackoverflow,
  siSteam,
  siStripe,
  siSubstack,
  siTelegram,
  siThreads,
  siTiktok,
  siTrustpilot,
  siTwitch,
  siVk,
  siWhatsapp,
  siWikipedia,
  siX,
  siYelp,
  siYoutube,
} from "./simple-icon-paths";

export interface BrandIcon {
  /** Weergavenaam, gebruikt voor tooltips en aria-labels. */
  title: string;
  /** Geverifieerd SVG-pad. */
  path: string;
  /** Officiële merkkleur (hex, inclusief #). */
  color: string;
  /** Lokaal officieel logobestand; heeft voorrang op het pad. */
  image?: string;
  /**
   * Afwijkende viewBox voor paden die niet op 24×24 getekend zijn
   * (bijv. het lokale merkasset /img/brand/eyou.svg, 113×106).
   * Standaard "0 0 24 24".
   */
  viewBox?: string;
}

const from = (icon: { title: string; path: string; hex: string }, color?: string): BrandIcon => ({
  title: icon.title,
  path: icon.path,
  color: color ?? `#${icon.hex}`,
});

/**
 * LinkedIn en Google mogen niet uit simple-icons komen (merkbeleid), dus staan
 * hier als geverifieerde vectoren. Google is meerkleurig en heeft daarom een
 * eigen component in de UI; het pad hier is de monochrome "G" als fallback.
 */
const LINKEDIN_PATH =
  "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z";

const GOOGLE_PATH =
  "M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.69v3.07h3.88c2.27-2.09 3.665-5.17 3.665-9z";

/**
 * Soevereine platformen die simple-icons niet dekt, als eigen vector.
 * eYou.social: het canonieke merkpad uit public/img/brand/eyou.svg
 * (113×106 bronsbestand, geen hertekende vector). wsocial.eu: het hoekige
 * W-merkteken. Beide in hun officiële merkkleur.
 */
const EYOU_PATH =
  "M112.4 86.2L85.1 97.4C84.2 86.3 76.3 67.1 69.2 59.7C65.6 76.9 52.1 93.7 40.4 105.9L17.6 83.1C28.1 77 45.2 67.9 52.1 55.5C34.3 57.5 15.9 52.6 0 45.4L13 14.4C25.1 25 39 36.1 56.9 37.8C55 32.3 47.7 21.8 43.4 17.3L60.7 0C64.6 6.2 70.1 26.5 70.4 34.3C78.1 28.5 100.2 18.8 111.1 17.2V44.2C104.6 43.4 84.4 45.2 79 47.1C88.4 52.6 103.7 68.4 109.5 79.8C110.4 81.7 111.5 84.1 112.5 86.3L112.4 86.2Z";

const WSOCIAL_PATH =
  "M1.2 3.4h4.1l3 11.1 3-11.1h3.4l3 11.1 3-11.1h4.1l-5.1 17.2h-4.1L12 9.9 9.4 20.6H5.3L1.2 3.4Z";

/** Vaste platformsleutel → officieel merk. Volledig hardcoded, geen gok. */
export const BRAND_ICONS: Record<string, BrandIcon> = {
  // Soeverein & fediverse
  mastodon: from(siMastodon),
  fediverse: { ...from(siMastodon), title: "Fediverse" },
  eyou: { title: "eYou.social", path: EYOU_PATH, color: "#0A80FF", viewBox: "0 0 113 106" },
  "eyou.social": {
    title: "eYou.social",
    path: EYOU_PATH,
    color: "#0A80FF",
    viewBox: "0 0 113 106",
  },
  wsocial: { title: "wsocial.eu", path: WSOCIAL_PATH, color: "#1E66F5", image: "/icons/wsocial.png" },
  "wsocial.eu": { title: "wsocial.eu", path: WSOCIAL_PATH, color: "#1E66F5", image: "/icons/wsocial.png" },
  "w.social": { title: "wsocial.eu", path: WSOCIAL_PATH, color: "#1E66F5", image: "/icons/wsocial.png" },
  pixelfed: from(siPixelfed),
  bluesky: from(siBluesky),
  bsky: from(siBluesky),
  matrix: from(siMatrix),
  element: { ...from(siMatrix), title: "Element" },
  signal: from(siSignal),

  // Mainstream socials
  instagram: from(siInstagram),
  tiktok: from(siTiktok, "#010101"),
  x: from(siX, "#111111"),
  twitter: { ...from(siX, "#111111"), title: "X" },
  threads: from(siThreads, "#111111"),
  youtube: from(siYoutube),
  facebook: from(siFacebook),
  snapchat: from(siSnapchat, "#F7C800"),
  pinterest: from(siPinterest),
  reddit: from(siReddit),
  linkedin: { title: "LinkedIn", path: LINKEDIN_PATH, color: "#0A66C2" },
  vk: from(siVk),
  twitch: from(siTwitch),
  discord: from(siDiscord),
  telegram: from(siTelegram),
  whatsapp: from(siWhatsapp),
  whatsapp_chat: { ...from(siWhatsapp), title: "WhatsApp" },
  substack: from(siSubstack),

  // Code & open source
  github: from(siGithub),
  gitlab: from(siGitlab),
  keycloak: from(siKeycloak, "#008AAA"),
  oidc: { ...from(siKeycloak, "#008AAA"), title: "Keycloak / OIDC" },
  google: { title: "Google", path: GOOGLE_PATH, color: "#4285F4" },
  stackoverflow: from(siStackoverflow),
  dribbble: from(siDribbble),
  behance: from(siBehance),
  notion: from(siNotion, "#111111"),
  wikipedia: from(siWikipedia),

  // Financiën & support
  paypal: from(siPaypal),
  stripe: from(siStripe),
  kofi: from(siKofi),
  patreon: from(siPatreon),

  // Media & gaming
  spotify: from(siSpotify),
  soundcloud: from(siSoundcloud),
  bandcamp: from(siBandcamp),
  deezer: from(siDeezer),
  steam: from(siSteam),
  letterboxd: from(siLetterboxd),
  goodreads: from(siGoodreads),
  imdb: from(siImdb),
  myanimelist: from(siMyanimelist),

  // Reputatie
  trustpilot: from(siTrustpilot),
  yelp: from(siYelp),
  kick: from(siKick),
  codepen: { title: "CodePen", path: "M24 8.182l-.018-.087-.017-.05c-.01-.024-.018-.05-.03-.075-.003-.018-.015-.034-.02-.05l-.035-.067-.03-.05-.044-.06-.046-.045-.06-.045-.046-.03-.06-.044-.044-.04-.015-.02L12.58.19c-.347-.232-.796-.232-1.142 0L.453 7.502l-.015.015-.044.035-.06.05-.038.04-.05.056-.037.045-.05.06c-.02.017-.03.03-.03.046l-.05.06-.02.06c-.02.01-.02.04-.03.07l-.01.05C0 8.12 0 8.15 0 8.18v7.497c0 .044.003.09.01.135l.01.046c.005.03.01.06.02.086l.015.05c.01.027.016.053.027.075l.022.05c0 .01.015.04.03.06l.03.04c.015.01.03.04.045.06l.03.04.04.04c.01.013.01.03.03.03l.06.042.04.03.01.014 10.97 7.33c.164.12.375.163.57.163s.39-.06.57-.18l10.99-7.28.014-.01.046-.037.06-.043.048-.036.052-.058.033-.045.04-.06.03-.05.03-.07.016-.052.03-.077.015-.045.03-.08v-7.5c0-.05 0-.095-.016-.14l-.014-.045.044.003zm-11.99 6.28l-3.65-2.44 3.65-2.442 3.66 2.441-3.66 2.44zm-1.034-6.674l-4.473 2.99L2.89 9.315l8.086-5.4V7.79zm-6.33 4.233l-2.582 1.73V10.3l2.582 1.726zm1.857 1.25l4.473 2.99v3.882l-8.086-5.4 3.613-2.412v-.06zm6.537 2.99l4.474-2.98 3.613 2.4-8.087 5.4v-3.88zm6.33-4.23l2.583-1.72v3.456l-2.583-1.73zm-1.855-1.24L13.042 7.8V3.92l8.085 5.4-3.612 2.415v.003z", color: "#111111" },
  readcv: from(siReaddotcv, "#111111"),
  hashnode: from(siHashnode),
  revolut: from(siRevolut, "#191c1f"),
  opencollective: from(siOpencollective),
  bmac: from(siBuymeacoffee),
  applemusic: from(siApplemusic),
  tidal: from(siTidal, "#111111"),
  lastfm: from(siLastdotfm),
  epicgames: from(siEpicgames, "#111111"),
  trakt: from(siTrakt),
  calcom: from(siCaldotcom, "#111111"),
  calendly: from(siCalendly),
  lightning: from(siBitcoin),
  evm: from(siEthereum),
  booking: from(siBookingdotcom),
};

/** Hostnaam-fragment → platformsleutel, voor vrij ingevoerde URLs. */
const HOST_KEYS: [RegExp, string][] = [
  [/(^|\.)github\.com$/, "github"],
  [/(^|\.)gitlab\.com$/, "gitlab"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)bsky\.app$/, "bluesky"],
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)facebook\.com$/, "facebook"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)open\.spotify\.com$|(^|\.)spotify\.com$/, "spotify"],
  [/(^|\.)soundcloud\.com$/, "soundcloud"],
  [/(^|\.)bandcamp\.com$/, "bandcamp"],
  [/(^|\.)deezer\.com$/, "deezer"],
  [/(^|\.)twitch\.tv$/, "twitch"],
  [/(^|\.)discord\.(gg|com)$/, "discord"],
  [/(^|\.)t\.me$|(^|\.)telegram\.(me|org)$/, "telegram"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "whatsapp"],
  [/(^|\.)signal\.(me|org)$/, "signal"],
  [/(^|\.)matrix\.to$/, "matrix"],
  [/(^|\.)pixelfed\.[a-z.]+$/, "pixelfed"],
  [/(^|\.)substack\.com$/, "substack"],
  [/(^|\.)paypal\.(me|com)$/, "paypal"],
  [/(^|\.)ko-fi\.com$/, "kofi"],
  [/(^|\.)patreon\.com$/, "patreon"],
  [/(^|\.)steamcommunity\.com$/, "steam"],
  [/(^|\.)letterboxd\.com$/, "letterboxd"],
  [/(^|\.)goodreads\.com$/, "goodreads"],
  [/(^|\.)imdb\.com$/, "imdb"],
  [/(^|\.)myanimelist\.net$/, "myanimelist"],
  [/(^|\.)trustpilot\.com$/, "trustpilot"],
  [/(^|\.)yelp\.[a-z.]+$/, "yelp"],
  [/(^|\.)stackoverflow\.com$/, "stackoverflow"],
  [/(^|\.)dribbble\.com$/, "dribbble"],
  [/(^|\.)behance\.net$/, "behance"],
  [/(^|\.)notion\.(so|site)$/, "notion"],
  [/(^|\.)wikipedia\.org$/, "wikipedia"],
  [/(^|\.)eyou\.social$/, "eyou"],
  [/(^|\.)w\.social$|(^|\.)wsocial\./, "wsocial"],
  [/mastodon|fosstodon|mstdn/, "mastodon"],
];

/** Normaliseert een sleutel: `@Handle`, "Ko-Fi", "whatsapp chat" → `kofi`. */
function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[\s/_-]+/g, "");
}

const NORMALIZED: Record<string, BrandIcon> = Object.fromEntries(
  Object.entries(BRAND_ICONS).map(([key, icon]) => [normalizeKey(key), icon]),
);

/**
 * Zoekt het officiële merkicoon bij een platformsleutel of volledige URL.
 * Geeft `null` terug wanneer het merk niet in de harde map staat — de UI toont
 * dan een neutraal link-icoon, nooit een wereldbol voor een sociaal netwerk.
 */
export function lookupBrandIcon(urlOrKey: string): BrandIcon | null {
  const raw = (urlOrKey ?? "").trim();
  if (!raw) return null;

  const key = normalizeKey(raw);
  if (NORMALIZED[key]) return NORMALIZED[key];

  if (raw.includes(".")) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    let host = "";
    try {
      host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      host = "";
    }
    if (host) {
      for (const [pattern, mapped] of HOST_KEYS) {
        if (pattern.test(host)) return BRAND_ICONS[mapped] ?? null;
      }
    }
  }

  // Fediverse-handle (@iemand@instantie.tld): eerst de instantie herkennen
  // (eyou.social heeft een eigen merk), pas daarna terugvallen op Mastodon.
  const handle = raw.match(/^@?[^@\s]+@([^@\s]+\.[a-z]{2,})$/i);
  if (handle) {
    const instance = handle[1]!.toLowerCase().replace(/^www\./, "");
    for (const [pattern, mapped] of HOST_KEYS) {
      if (pattern.test(instance)) return BRAND_ICONS[mapped] ?? null;
    }
    return BRAND_ICONS.mastodon ?? null;
  }

  return null;
}

/** Officiële merkkleur, of `null` wanneer het platform onbekend is. */
export function brandColorOf(urlOrKey: string): string | null {
  return lookupBrandIcon(urlOrKey)?.color ?? null;
}
