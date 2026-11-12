/**
 * Brand intelligence.
 *
 * Given a raw URL (or any value that contains a domain) we try to recognise a
 * well-known brand so the studio can offer its palette + logo in one click.
 * Unknown domains still get a favicon suggestion via a CORS-friendly icon CDN.
 */

export interface BrandStyle {
  /** Body pattern id used by BodyShapeSelector. */
  bodyShape: string;
  dotStyle: string;
  outerCornerStyle: string;
  innerCornerStyle: string;
}

export interface BrandSuggestion {
  /** Human label, e.g. "PayPal". */
  name: string;
  /** Bare hostname without www, e.g. "paypal.com". */
  domain: string;
  /** Primary brand colour, used for the QR dots. */
  fgColor: string;
  /** Background colour that stays high-contrast against fgColor. */
  bgColor: string;
  /** Absolute, CORS-enabled logo URL that qr-code-styling can embed. */
  logo: string;
  /** Shape language that matches the brand's own visual identity. */
  style: BrandStyle;
  /** Which shape language was picked (drives the "Brand it" settings UI). */
  shapeKey: BrandShapeKey;
}

/** Shape languages: brands are either geometric, soft or fully round. */
export const BRAND_SHAPES: Record<"sharp" | "soft" | "round" | "organic", BrandStyle> = {
  sharp: {
    bodyShape: "square",
    dotStyle: "square",
    outerCornerStyle: "square",
    innerCornerStyle: "square",
  },
  soft: {
    bodyShape: "rounded",
    dotStyle: "rounded",
    outerCornerStyle: "extra-rounded",
    innerCornerStyle: "dot",
  },
  round: {
    bodyShape: "dots",
    dotStyle: "dots",
    outerCornerStyle: "dot",
    innerCornerStyle: "dot",
  },
  organic: {
    bodyShape: "classy",
    dotStyle: "classy",
    outerCornerStyle: "extra-rounded",
    innerCornerStyle: "dot",
  },
};

export type BrandShapeKey = keyof typeof BRAND_SHAPES;
type ShapeKey = BrandShapeKey;

/** Human labels for the shape languages, used by the "Brand it" settings. */
export const BRAND_SHAPE_LABELS: { id: BrandShapeKey; label: string }[] = [
  { id: "sharp", label: "Strak" },
  { id: "soft", label: "Zacht" },
  { id: "round", label: "Rond" },
  { id: "organic", label: "Organisch" },
];

/** Curated palettes for brands people scan-to-visit the most. */
const KNOWN_BRANDS: Record<string, { name: string; fg: string; bg: string; shape: ShapeKey }> = {
  "delplanche.com": { name: "Delplanche", fg: "#1C1917", bg: "#FAF6F0", shape: "organic" },
  "rout.be": { name: "ROUT", fg: "#12261F", bg: "#F2FBF7", shape: "organic" },
  "paypal.com": { name: "PayPal", fg: "#003087", bg: "#FFFFFF", shape: "round" },
  "spotify.com": { name: "Spotify", fg: "#1DB954", bg: "#101010", shape: "round" },
  "youtube.com": { name: "YouTube", fg: "#FF0000", bg: "#FFFFFF", shape: "soft" },
  "instagram.com": { name: "Instagram", fg: "#C13584", bg: "#FFFFFF", shape: "soft" },
  "facebook.com": { name: "Facebook", fg: "#1877F2", bg: "#FFFFFF", shape: "round" },
  "linkedin.com": { name: "LinkedIn", fg: "#0A66C2", bg: "#FFFFFF", shape: "sharp" },
  "x.com": { name: "X", fg: "#000000", bg: "#FFFFFF", shape: "sharp" },
  "twitter.com": { name: "X (Twitter)", fg: "#000000", bg: "#FFFFFF", shape: "sharp" },
  "tiktok.com": { name: "TikTok", fg: "#000000", bg: "#FFFFFF", shape: "soft" },
  "whatsapp.com": { name: "WhatsApp", fg: "#25D366", bg: "#FFFFFF", shape: "round" },
  "github.com": { name: "GitHub", fg: "#181717", bg: "#FFFFFF", shape: "soft" },
  "airbnb.com": { name: "Airbnb", fg: "#FF5A5F", bg: "#FFFFFF", shape: "round" },
  "booking.com": { name: "Booking.com", fg: "#003580", bg: "#FFFFFF", shape: "soft" },
  "amazon.com": { name: "Amazon", fg: "#FF9900", bg: "#131921", shape: "soft" },
  "shopify.com": { name: "Shopify", fg: "#5E8E3E", bg: "#FFFFFF", shape: "soft" },
  "bol.com": { name: "bol", fg: "#0000A4", bg: "#FFFFFF", shape: "round" },
  "coolblue.be": { name: "Coolblue", fg: "#0090E3", bg: "#FFFFFF", shape: "soft" },
  "stripe.com": { name: "Stripe", fg: "#635BFF", bg: "#FFFFFF", shape: "soft" },
  "notion.so": { name: "Notion", fg: "#191919", bg: "#FFFFFF", shape: "sharp" },
  "figma.com": { name: "Figma", fg: "#F24E1E", bg: "#FFFFFF", shape: "round" },
  "pinterest.com": { name: "Pinterest", fg: "#E60023", bg: "#FFFFFF", shape: "round" },
  "twitch.tv": { name: "Twitch", fg: "#9146FF", bg: "#FFFFFF", shape: "sharp" },
  "reddit.com": { name: "Reddit", fg: "#FF4500", bg: "#FFFFFF", shape: "round" },
  "apple.com": { name: "Apple", fg: "#111111", bg: "#F5F5F7", shape: "soft" },
  "microsoft.com": { name: "Microsoft", fg: "#0078D4", bg: "#FFFFFF", shape: "sharp" },
};

/** Extract a bare hostname from anything that smells like a URL. */
export function extractDomain(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/** Favicon endpoint used for the little preview thumbnail in the UI. */
export function faviconFor(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/**
 * Same icon, but through our own same-origin route so it arrives with CORS
 * headers and can legally be inlined into the QR (favicon CDNs send none).
 */
export function brandLogoProxy(domain: string): string {
  return `/api/public/brand-logo?domain=${encodeURIComponent(domain)}`;
}

/**
 * Fetch a remote logo and inline it as a data URL.
 *
 * qr-code-styling loads `image` through the DOM; a favicon that 404s or is
 * served without CORS leaves the renderer with a rejected drawing promise and
 * an empty container — that is the "QR disappears after Brand it" bug. By
 * resolving the bytes up front we either hand the renderer a safe data URL or
 * we never touch the logo at all.
 */
export async function loadLogoDataUrl(urlOrDomain: string): Promise<string | null> {
  const domain = extractDomain(urlOrDomain);
  const url = domain ? brandLogoProxy(domain) : urlOrDomain;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || !blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Best-effort brand match: exact host, then registrable root. */
export function detectBrand(raw: string): BrandSuggestion | null {
  const domain = extractDomain(raw);
  if (!domain) return null;

  const parts = domain.split(".");
  const candidates = [domain];
  for (let i = 1; i < parts.length - 1; i++) candidates.push(parts.slice(i).join("."));

  for (const key of candidates) {
    const hit = KNOWN_BRANDS[key];
    if (hit) {
      return {
        name: hit.name,
        domain: key,
        fgColor: hit.fg,
        bgColor: hit.bg,
        logo: faviconFor(key),
        style: BRAND_SHAPES[hit.shape],
        shapeKey: hit.shape,
      };
    }
  }

  // Unknown brand — still offer the site's own icon with a neutral palette and
  // the softly rounded shape language the rest of the app uses.
  const label = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return {
    name: label,
    domain,
    fgColor: "#1C1917",
    bgColor: "#FFFFFF",
    logo: faviconFor(domain),
    style: BRAND_SHAPES.soft,
    shapeKey: "soft",
  };
}

export function isKnownBrand(raw: string): boolean {
  const domain = extractDomain(raw);
  if (!domain) return false;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (KNOWN_BRANDS[parts.slice(i).join(".")]) return true;
  }
  return false;
}

/** Slugify anything into a safe, lowercase filename fragment. */
export function slugify(input: string, max = 40): string {
  return (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export interface FilenameSource {
  qrType: string;
  url?: string;
  text?: string;
  wifiSSID?: string;
  emailAddress?: string;
  smsPhone?: string;
  whatsappPhone?: string;
  paymentLabel?: string;
}

/**
 * Derive a descriptive download filename from whatever the user typed:
 * a URL becomes "delplanche-com-qr", a Wi-Fi network becomes "wifi-office-qr".
 */
export function suggestFilename(src: FilenameSource): string {
  const { qrType } = src;

  const fromUrl = (value?: string) => {
    const domain = extractDomain(value ?? "");
    if (domain) return slugify(domain);
    return slugify(value ?? "");
  };

  let core = "";
  switch (qrType) {
    case "url":
    case "image":
    case "pdf":
    case "mp3":
    case "app":
      core = fromUrl(src.url);
      break;
    case "text":
      core = slugify((src.text ?? "").split(/\s+/).slice(0, 5).join(" "), 32);
      break;
    case "wifi":
      core = src.wifiSSID ? `wifi-${slugify(src.wifiSSID, 28)}` : "";
      break;
    case "email":
      core = src.emailAddress ? `email-${slugify(src.emailAddress.split("@")[0], 28)}` : "";
      break;
    case "sms":
      core = src.smsPhone ? `sms-${slugify(src.smsPhone, 20)}` : "";
      break;
    case "whatsapp":
      core = src.whatsappPhone ? `whatsapp-${slugify(src.whatsappPhone, 20)}` : "";
      break;
    default:
      core = slugify(src.paymentLabel ?? qrType, 28);
  }

  if (!core) core = slugify(qrType) || "qrcode";
  return `${core}-qr`;
}
