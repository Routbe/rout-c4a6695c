import type { Locale } from "@/lib/i18n";
import { SITE_ORIGIN } from "@/lib/site";
import { ogLocale } from "@/lib/social-meta";

/**
 * Unieke deel-kaart per publieke pagina: eigen afbeelding, kaderkleur
 * (`theme-color`, o.a. de rand in Discord) en tekst in elke taal.
 * Afbeeldingen lopen via `/brand/og/*` → interne Scaleway-bucket.
 */
export type PageKey = "home" | "about" | "explore" | "privacy" | "press" | "contact" | "terms" | "sovereignty";

type Text = { title: string; description: string; alt: string };

interface PageCard {
  path: string;
  image: string;
  themeColor: string;
  text: Record<Locale, Text>;
}

export const PAGE_CARDS: Record<PageKey, PageCard> = {
  home: {
    path: "/",
    image: "home.jpg",
    themeColor: "#C9A84C",
    text: {
      nl: { title: "ROUT — Eén identiteit voor alles wat je deelt", description: "Profielhub, QR-codes, korte links, anonieme vragen en je ROUT-kaart in Wallet. Zonder trackers, op Europese servers.", alt: "Goudkleurige QR-code met het ROUT-konijn" },
      en: { title: "ROUT — One identity for everything you share", description: "Profile hub, QR codes, short links, anonymous questions and your ROUT card in Wallet. No trackers, on European servers.", alt: "Gold QR code with the ROUT rabbit" },
      fr: { title: "ROUT — Une identité pour tout ce que vous partagez", description: "Profil, QR codes, liens courts, questions anonymes et votre carte ROUT dans Wallet. Sans traqueurs, hébergé en Europe.", alt: "QR code doré avec le lapin ROUT" },
      de: { title: "ROUT — Eine Identität für alles, was du teilst", description: "Profil-Hub, QR-Codes, Kurzlinks, anonyme Fragen und deine ROUT-Karte im Wallet. Ohne Tracker, auf europäischen Servern.", alt: "Goldener QR-Code mit dem ROUT-Hasen" },
    },
  },
  about: {
    path: "/about",
    image: "about.jpg",
    themeColor: "#F4EFE3",
    text: {
      nl: { title: "Over ROUT — Gebouwd in Europa. Van jou.", description: "Ons manifest: Europese infrastructuur, nul trackers, privacy eerst en een identiteit die je zelf bezit.", alt: "Manifest: Built in Europe. Owned by you." },
      en: { title: "About ROUT — Built in Europe. Owned by you.", description: "Our manifesto: European infrastructure, zero trackers, privacy first and an identity you truly own.", alt: "Manifesto: Built in Europe. Owned by you." },
      fr: { title: "À propos de ROUT — Construit en Europe. À vous.", description: "Notre manifeste : infrastructure européenne, zéro traqueur, la vie privée d'abord et une identité qui vous appartient.", alt: "Manifeste : Built in Europe. Owned by you." },
      de: { title: "Über ROUT — Gebaut in Europa. Gehört dir.", description: "Unser Manifest: europäische Infrastruktur, null Tracker, Privatsphäre zuerst und eine Identität, die dir gehört.", alt: "Manifest: Built in Europe. Owned by you." },
    },
  },
  explore: {
    path: "/explore",
    image: "explore.jpg",
    themeColor: "#41DB97",
    text: {
      nl: { title: "Ontdek — Echte profielen, echte mensen | ROUT", description: "Een galerij van echte leden: schone link-in-bio pagina's zonder trackers, op Europese infrastructuur.", alt: "Collage van kleurrijke ROUT-profielen" },
      en: { title: "Explore — Real profiles, real people | ROUT", description: "A gallery of real members: clean link-in-bio pages without trackers, on European infrastructure.", alt: "Collage of colourful ROUT profiles" },
      fr: { title: "Découvrir — De vrais profils, de vraies personnes | ROUT", description: "Une galerie de vrais membres : des pages link-in-bio épurées, sans traqueurs, sur une infrastructure européenne.", alt: "Collage de profils ROUT colorés" },
      de: { title: "Entdecken — Echte Profile, echte Menschen | ROUT", description: "Eine Galerie echter Mitglieder: klare Link-in-Bio-Seiten ohne Tracker, auf europäischer Infrastruktur.", alt: "Collage bunter ROUT-Profile" },
    },
  },
  privacy: {
    path: "/privacy",
    image: "privacy.jpg",
    themeColor: "#7026E1",
    text: {
      nl: { title: "Privacybeleid — Jouw data blijft van jou | ROUT", description: "Hoe ROUT met je gegevens, scans en statistieken omgaat. Geen trackers, geen verkoop, alles in de EU.", alt: "Groen slot op paarse achtergrond" },
      en: { title: "Privacy policy — Your data stays yours | ROUT", description: "How ROUT handles your data, scans and statistics. No trackers, no selling, everything in the EU.", alt: "Green padlock on a violet background" },
      fr: { title: "Confidentialité — Vos données restent à vous | ROUT", description: "Comment ROUT traite vos données, scans et statistiques. Sans traqueurs, sans revente, tout dans l'UE.", alt: "Cadenas vert sur fond violet" },
      de: { title: "Datenschutz — Deine Daten bleiben deine | ROUT", description: "Wie ROUT mit deinen Daten, Scans und Statistiken umgeht. Keine Tracker, kein Verkauf, alles in der EU.", alt: "Grünes Schloss auf violettem Hintergrund" },
    },
  },
  press: {
    path: "/press",
    image: "press.jpg",
    themeColor: "#131211",
    text: {
      nl: { title: "Pers & merkkit | ROUT", description: "Officiële ROUT-logo's (SVG/PNG), kleurenpalet, typografie, standaardteksten en perscontact.", alt: "ROUT-konijn op donker, licht en transparant" },
      en: { title: "Press & brand kit | ROUT", description: "Official ROUT logos (SVG/PNG), colour palette, typography, boilerplate and press contact.", alt: "ROUT rabbit on dark, light and transparent" },
      fr: { title: "Presse & kit de marque | ROUT", description: "Logos officiels ROUT (SVG/PNG), palette de couleurs, typographie, textes types et contact presse.", alt: "Lapin ROUT sur fond sombre, clair et transparent" },
      de: { title: "Presse & Markenkit | ROUT", description: "Offizielle ROUT-Logos (SVG/PNG), Farbpalette, Typografie, Standardtexte und Pressekontakt.", alt: "ROUT-Hase auf dunkel, hell und transparent" },
    },
  },
  contact: {
    path: "/contact",
    image: "contact.jpg",
    themeColor: "#F2725A",
    text: {
      nl: { title: "Contact — Laten we praten | ROUT", description: "Vragen, feedback of support? Stuur ons een bericht, we antwoorden binnen een werkdag.", alt: "Envelop met tekstballon" },
      en: { title: "Contact — Let's talk | ROUT", description: "Questions, feedback or support? Send us a message, we reply within one working day.", alt: "Envelope with a speech bubble" },
      fr: { title: "Contact — Parlons-en | ROUT", description: "Questions, avis ou support ? Écrivez-nous, nous répondons sous un jour ouvré.", alt: "Enveloppe avec une bulle" },
      de: { title: "Kontakt — Lass uns reden | ROUT", description: "Fragen, Feedback oder Support? Schreib uns, wir antworten innerhalb eines Werktags.", alt: "Briefumschlag mit Sprechblase" },
    },
  },
  terms: {
    path: "/terms",
    image: "terms.jpg",
    themeColor: "#4A6382",
    text: {
      nl: { title: "Algemene voorwaarden — Helder, zonder kleine lettertjes | ROUT", description: "De voorwaarden voor ROUT in duidelijke taal. Wij verkopen nooit je gegevens.", alt: "Stapel documenten met vulpen" },
      en: { title: "Terms of service — Clear, no fine print | ROUT", description: "The terms for ROUT in plain language. We never sell your data.", alt: "Stack of documents with a fountain pen" },
      fr: { title: "Conditions générales — Claires, sans petits caractères | ROUT", description: "Les conditions de ROUT en langage clair. Nous ne vendons jamais vos données.", alt: "Pile de documents et stylo plume" },
      de: { title: "AGB — Klar, ohne Kleingedrucktes | ROUT", description: "Die Bedingungen von ROUT in verständlicher Sprache. Wir verkaufen nie deine Daten.", alt: "Dokumentenstapel mit Füllfeder" },
    },
  },
  sovereignty: {
    path: "/sovereignty",
    image: "sovereignty.jpg",
    themeColor: "#0E1A33",
    text: {
      nl: { title: "Digitale soevereiniteit | ROUT", description: "Waarom eigenaarschap van je links en data belangrijk is — Europese servers, open standaarden, zelf te hosten.", alt: "Europa in lichtpunten op nachtblauw" },
      en: { title: "Digital sovereignty | ROUT", description: "Why owning your links and data matters — European servers, open standards, self-hostable.", alt: "Europe in points of light on navy" },
      fr: { title: "Souveraineté numérique | ROUT", description: "Pourquoi posséder vos liens et vos données compte — serveurs européens, standards ouverts, auto-hébergeable.", alt: "L'Europe en points lumineux sur bleu nuit" },
      de: { title: "Digitale Souveränität | ROUT", description: "Warum der Besitz deiner Links und Daten zählt — europäische Server, offene Standards, selbst hostbar.", alt: "Europa als Lichtpunkte auf Nachtblau" },
    },
  },
};

/** Eén vaste, in code getekende kaart per pagina per taal (geen rotatie). */
export function pageCardImage(key: PageKey, locale: Locale = "en") {
  return `${SITE_ORIGIN}/brand/og/${key}-${locale}.png?v=3`;
}

/** Volledige `meta` voor de `head()` van een publieke pagina. */
export function pageMeta(key: PageKey, locale: Locale = "en") {
  const card = PAGE_CARDS[key];
  const t = card.text[locale] ?? card.text.en;
  const image = pageCardImage(key, locale);
  const url = `${SITE_ORIGIN}${card.path}`;
  return [
    { title: t.title },
    { name: "description", content: t.description },
    { property: "og:title", content: t.title },
    { property: "og:description", content: t.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "ROUT" },
    { property: "og:url", content: url },
    { property: "og:locale", content: ogLocale(locale) },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:alt", content: t.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: t.title },
    { name: "twitter:description", content: t.description },
    { name: "twitter:image", content: image },
    { name: "theme-color", content: card.themeColor },
  ];
}
