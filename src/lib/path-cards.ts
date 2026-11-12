import type { Locale } from "@/lib/i18n";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * Share cards for pages outside PAGE_CARDS: every doc page and a fixed list of
 * static tool/info pages. Text comes only from this list or the docs catalog
 * (never from the URL), so the image route can't be made to draw arbitrary text.
 */
export type PathCard = { label: string; title: string; desc: string; accent: string };

/** Frame/message colour per docs section (also used as `theme-color`). */
export const SECTION_ACCENT: Record<string, string> = {
  about: "#E9CA89",
  info: "#92C9FF",
  dev: "#C0EF5C",
  safety: "#7FD8B4",
  "qr-code-generator": "#C9A84C",
  product: "#FF976A",
  features: "#CBAAFF",
  solutions: "#FF719E",
  compare: "#F2725A",
  guide: "#F5C542",
  support: "#6FC3DF",
};

export const STATIC_PATH_CARDS: Record<string, PathCard> = {
  "/batch": { label: "QR STUDIO", title: "Batch QR-generator", desc: "Genereer honderden QR-codes in één keer vanuit een CSV en download ze als ZIP.", accent: "#C9A84C" },
  "/data-deletion": { label: "TRUST & SAFETY", title: "Data deletion instructions", desc: "Disconnect services, revoke OAuth tokens or delete your ROUT account and data.", accent: "#7FD8B4" },
  "/developers": { label: "DEVELOPERS", title: "Login met ROUT, verificaties en API", desc: "Integreer Login met ROUT (OIDC + PKCE), begrijp verificaties en bekijk alle endpoints en limieten.", accent: "#C0EF5C" },
  "/discover": { label: "DISCOVER", title: "Negen producten. Eén identiteit.", desc: "Profiel, QR-codes, links, ROUT ID, ROUT-kaart, creator support, vragen, workspaces en developers.", accent: "#CBAAFF" },
  "/email-templates": { label: "TOOLS", title: "E-mailtemplates generator", desc: "Twee schone HTML-e-mailtemplates in ROUT-huisstijl: persoonlijk en team.", accent: "#92C9FF" },
  "/iban-qr": { label: "QR STUDIO", title: "IBAN QR-code (SEPA / EPC)", desc: "Maak een SEPA-betaal-QR uit IBAN, bedrag en mededeling. Volledig in je browser, zonder account.", accent: "#F5C542" },
  "/manifesto": { label: "MANIFESTO", title: "Waar ROUT voor staat", desc: "Eigenaarschap van je links, privacy en open technologie.", accent: "#E9CA89" },
  "/press/previews": { label: "PERSKIT", title: "Deelafbeeldingen", desc: "De officiële deelkaarten die ROUT toont op WhatsApp, Snapchat, LinkedIn, Slack en X.", accent: "#F4EFE3" },
  "/press/wallet": { label: "PERSKIT", title: "Google Wallet-beelden", desc: "Officiële ROUT-beelden voor Google Wallet, in code getekend uit het echte logo.", accent: "#F4EFE3" },
  "/security": { label: "TRUST CENTER", title: "Privacy die je kunt controleren", desc: "Lokale versleuteling, standaard OIDC, minimale gegevensdeling en gecontroleerde toegang.", accent: "#7FD8B4" },
  "/self-hosting": { label: "OPEN SOURCE", title: "Self-hosting ROUT", desc: "Draai ROUT op je eigen infrastructuur: installatie, configuratie en updates.", accent: "#C0EF5C" },
  "/signature": { label: "TOOLS", title: "E-mailhandtekening generator", desc: "Een strakke HTML-handtekening met micro-QR of avatar en link-in-bio badge.", accent: "#92C9FF" },
  "/status": { label: "STATUS", title: "Systeemstatus", desc: "Live status van database, mailrelays en betaalgateways. Zonder cookies gemeten.", accent: "#7FD8B4" },
  "/studio": { label: "STUDIO", title: "Creatie & profielhub", desc: "Ontwerp dynamische QR-codes en bouw je soevereine link-in-bio profielhub.", accent: "#FF976A" },
  "/tour": { label: "RONDLEIDING", title: "Bouw je ROUT-profiel", desc: "In vier stappen: kies je handle, schrijf je bio, kies je thema en bewaar alles.", accent: "#FF719E" },
  "/vcard-qr": { label: "QR STUDIO", title: "vCard QR-code", desc: "Een digitaal visitekaartje als QR: naam, telefoon, e-mail en website. Zonder tracking.", accent: "#C9A84C" },
  "/verify": { label: "ROUT ID", title: "Blauw vinkje en privacyschild", desc: "Hoe ROUT je identiteit controleert via bank of eID, en wat we wél en niet bewaren.", accent: "#6FC3DF" },
  "/wifi-qr": { label: "QR STUDIO", title: "WiFi QR-code", desc: "Deel je wifi met één scan. SSID en wachtwoord blijven in je browser.", accent: "#C9A84C" },
};

const SLUG_RE = /^[a-z0-9-]+(?:~[a-z0-9-]+)*$/;
/** `/info/connected-apps` ⇄ `info~connected-apps` (URL-safe, one path segment). */
export const pathToSlug = (path: string) => path.replace(/^\//, "").replace(/\//g, "~");
export function slugToPath(slug: string): string | null {
  return SLUG_RE.test(slug) ? `/${slug.replace(/~/g, "/")}` : null;
}

export function pathCardImage(path: string, locale: Locale = "nl") {
  return `${SITE_ORIGIN}/brand/og/p/${pathToSlug(path)}-${locale}.png?v=3`;
}

/** Image + frame colour tags for a static page in STATIC_PATH_CARDS. */
export function pathCardMeta(path: string, locale: Locale = "nl") {
  const card = STATIC_PATH_CARDS[path];
  const image = pathCardImage(path, locale);
  return [
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:image", content: image },
    ...(card ? [{ name: "theme-color", content: card.accent }] : []),
  ];
}

/** Snapchat shows link previews square: its crawler gets the square layout. */
export function wantsSquareCard(userAgent: string | null, format: string | null): boolean {
  if (format === "square") return true;
  if (format === "wide") return false;
  return !!userAgent && /snapchat|snap url preview/i.test(userAgent);
}
