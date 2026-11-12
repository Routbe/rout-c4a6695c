import type { Locale } from "@/lib/i18n";
import { profilePreviewPath } from "@/lib/profile-preview";

/**
 * Multilingual social preview cards.
 *
 * The site keeps flat, language-independent URLs, so the locale comes from the
 * `rout_lang` cookie (server-rendered) or the `/en/`, `/fr/`, `/de/` prefix
 * when a link carries one. Every locale gets its own OpenGraph + Twitter card.
 */

export const OG_IMAGE = "/brand/og/home-en.png";

type Card = { title: string; description: string };

/** Valid Open Graph language_TERRITORY tags (en_EN is not a real territory). */
const OG_LOCALES: Record<Locale, string> = { nl: "nl_BE", en: "en_US", fr: "fr_BE", de: "de_DE" };
export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale] ?? "en_US";
}

export const SOCIAL_CARDS: Record<Locale, Card> = {
  nl: {
    title: "ROUT - Sovereign Digital Identity OS",
    description:
      "Het soevereine besturingssysteem voor je digitale identiteit: één geverifieerde identiteit, privé-relais per app, Login met ROUT en routing aan de edge. Open source (AGPLv3) en Europees.",
  },
  en: {
    title: "ROUT - Sovereign Digital Identity OS",
    description:
      "The sovereign operating system for your digital identity: one verified identity, private relays per app, Login with ROUT and edge routing. Open source (AGPLv3) and European.",
  },
  fr: {
    title: "ROUT - Sovereign Digital Identity OS",
    description:
      "Le système d'exploitation souverain de votre identité numérique : une identité vérifiée, des relais privés par app, Login avec ROUT et routage en edge. Open source (AGPLv3) et européen.",
  },
  de: {
    title: "ROUT - Sovereign Digital Identity OS",
    description:
      "Das souveräne Betriebssystem für deine digitale Identität: eine verifizierte Identität, private Relays pro App, Login mit ROUT und Edge-Routing. Open Source (AGPLv3) und europäisch.",
  },
};

/** Picks the locale from a `/en/…` style path prefix, if present. */
export function localeFromPath(pathname: string): Locale | null {
  const match = /^\/(nl|en|fr|de)(?:\/|$)/.exec(pathname);
  return (match?.[1] as Locale | undefined) ?? null;
}

/** Ready-to-spread `meta` array for a route `head()`. */
export function socialMeta(locale: Locale, absoluteImageUrl?: string | null) {
  const card = SOCIAL_CARDS[locale] ?? SOCIAL_CARDS.en;
  const image = absoluteImageUrl ?? null;
  return [
    { title: card.title },
    { name: "description", content: card.description },
    { property: "og:title", content: card.title },
    { property: "og:description", content: card.description },
    { property: "og:locale", content: ogLocale(locale) },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    ...(image
      ? [
          { property: "og:image", content: image },
          { name: "twitter:image", content: image },
        ]
      : []),
  ];
}

/**
 * OpenGraph card for a public member profile. Mastodon, Bluesky and friends
 * read these tags straight from the server-rendered HTML.
 */
export function profileSocialMeta(input: {
  locale: Locale;
  handle: string;
  displayName?: string | null;
  tagline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  frozen?: boolean;
  /** Eigen overrides uit de Studio ("Social Sharing & SEO"). */
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageUrl?: string | null;
  accentColor?: string | null;
  /** Absolute URL van de profielpagina zelf. */
  url?: string | null;
  space?: "root" | "alias";
}) {
  const name = input.displayName?.trim() || `@${input.handle}`;
  const title = input.metaTitle?.trim() || `${name} (@${input.handle}) — ROUT`;
  const description = input.frozen
    ? SOCIAL_CARDS[input.locale].description
    : input.metaDescription?.trim() ||
      input.tagline?.trim() ||
      input.bio?.trim()?.slice(0, 160) ||
      SOCIAL_CARDS[input.locale].description;
  // Eigen upload > dynamisch gegenereerde ROUT-kaart (nooit de kale avatar).
  const image =
    input.ogImageUrl?.trim() ||
    `https://rout.be${profilePreviewPath(input.handle, input.space)}`;
  const url = input.url?.trim() || `https://rout.be/${input.handle}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "profile" },
    { property: "og:site_name", content: "ROUT" },
    { property: "og:url", content: url },
    { property: "og:locale", content: ogLocale(input.locale) },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { property: "og:image:alt", content: `${name} op ROUT` },
    { property: "og:image:type", content: image.endsWith(".svg") ? "image/svg+xml" : "image/png" },
    // Discord kleurt de rand van de embed met theme-color; mobiele browsers de
    // adresbalk. Zonder eigen accent valt ROUT terug op het huisgoud.
    { name: "theme-color", content: input.accentColor?.trim() || "#C9A84C" },
    ...(input.frozen ? [{ name: "robots", content: "noindex, nofollow" }] : []),
  ];
}

/** Canonieke URL voor een publieke route (altijd absoluut, zonder query). */
export function canonicalLinks(path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return [{ rel: "canonical", href: `https://rout.be${clean.replace(/\/+$/, "") || "/"}` }];
}

/** JSON-LD-script voor een route `head()`. */
export function jsonLdScript(data: Record<string, unknown>) {
  return [{ type: "application/ld+json", children: JSON.stringify(data) }];
}

/** Gestructureerde data voor een publiek ledenprofiel. */
export function profileJsonLd(input: {
  handle: string;
  url: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}) {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: input.displayName?.trim() || `@${input.handle}`,
      alternateName: `@${input.handle}`,
      url: input.url,
      ...(input.bio ? { description: input.bio.slice(0, 300) } : {}),
      ...(input.avatarUrl?.startsWith("http") ? { image: input.avatarUrl } : {}),
    },
  });
}

/** Gestructureerde data voor een donatiepagina. */
export function donateJsonLd(input: { handle: string; url: string }) {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "DonateAction",
    name: `Steun @${input.handle}`,
    url: input.url,
    recipient: { "@type": "Person", alternateName: `@${input.handle}`, url: input.url },
  });
}
