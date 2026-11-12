/**
 * ROUT badge-engine — één bron voor de SVG die op de publieke API-route
 * (`/api/public/badge/:handle`), in de Studio-preview en in het JS-widget
 * gebruikt wordt. Volledig puur en browser-veilig (geen Node-API's).
 *
 * De pictogrammen gebruiken exact dezelfde geometrie als de badges op het
 * publieke profiel:
 *  • `verified`       → lucide `badge-check` rozet (ROUT-blauw #1d9bf0)
 *  • `privacy_shield` → `HumanLinkedIcon` (keurmerk in een hand)
 */

export type BadgeStatus = "verified" | "privacy_shield";
export type BadgeFormat = "pill" | "compact";
export type BadgeCorners = "rounded" | "square";
export type BadgeTheme = "dark" | "light" | "glass";

export type BadgeOptions = {
  handle: string;
  status: BadgeStatus;
  format: BadgeFormat;
  corners: BadgeCorners;
  theme: BadgeTheme;
};

export const BADGE_STATUS_OPTIONS: { id: BadgeStatus; label: string; note: string }[] = [
  { id: "verified", label: "Geverifieerd", note: "Blauw vinkje — rout.be/[handle]" },
  { id: "privacy_shield", label: "Privacy-schild", note: "Mens-badge — rout.be/u/[alias]" },
];

export const BADGE_FORMAT_OPTIONS: { id: BadgeFormat; label: string; note: string }[] = [
  { id: "pill", label: "Volledige balk", note: "Pictogram + tekst + @handle." },
  { id: "compact", label: "Compact icoon", note: "Losse stempel / micro-widget." },
];

export const BADGE_CORNER_OPTIONS: { id: BadgeCorners; label: string }[] = [
  { id: "rounded", label: "Rond" },
  { id: "square", label: "Strak" },
];

export const BADGE_THEME_OPTIONS: { id: BadgeTheme; label: string }[] = [
  { id: "dark", label: "Donker" },
  { id: "light", label: "Licht" },
  { id: "glass", label: "Glas / outline" },
];

export const BADGE_LABEL: Record<BadgeStatus, string> = {
  verified: "OFFICIEEL GEVERIFIEERD",
  privacy_shield: "GEKOPPELD AAN GEVERIFIEERD ACCOUNT",
};

export const BADGE_BODY: Record<BadgeStatus, string> = {
  verified: "Identiteit bevestigd door ROUT.",
  privacy_shield: "Gekoppeld aan een geverifieerd, menselijk account — zonder naam te tonen.",
};

/** Publiek profielpad per badgetype. */
export function badgeProfilePath(status: BadgeStatus, handle: string) {
  return status === "verified" ? `/${handle}` : `/u/${handle}`;
}

const THEMES: Record<
  BadgeTheme,
  { bg: string; border: string; text: string; muted: string; check: string }
> = {
  dark: { bg: "#18181b", border: "#27272a", text: "#fafafa", muted: "#a1a1aa", check: "#e4e4e7" },
  light: { bg: "#ffffff", border: "#e4e4e7", text: "#18181b", muted: "#52525b", check: "#3f3f46" },
  glass: { bg: "none", border: "#a1a1aa", text: "#71717a", muted: "#8b8b93", check: "#71717a" },
};

function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
}

/** Gekartelde keurmerkrand van het mens-pictogram (identiek aan HumanLinkedIcon). */
const humanStampPoints = Array.from({ length: 32 }, (_, i) => {
  const angle = (i / 32) * Math.PI * 2;
  const radius = i % 2 === 0 ? 7.6 : 6.6;
  return `${(12 + Math.cos(angle) * radius).toFixed(2)},${(9 + Math.sin(angle) * radius).toFixed(2)}`;
}).join(" ");

/**
 * Pictogram als losse SVG-groep in een 24×24 raster, zodat het in de badge en
 * in het widget exact hetzelfde oogt als op het profiel.
 */
export function badgeIconMarkup(status: BadgeStatus, theme: BadgeTheme) {
  const t = THEMES[theme];
  if (status === "verified") {
    return `<g fill="none" stroke="#1d9bf0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#1d9bf0" fill-opacity="0.14"/>
      <path d="m9 12 2 2 4-4"/>
    </g>`;
  }
  return `<g fill="none" stroke="${t.check}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="${humanStampPoints}"/>
      <circle cx="12" cy="9" r="4.4"/>
      <path d="M10 9.2l1.5 1.6L14.2 7.6"/>
      <path d="M2.6 18.4l2-2.4 3 2.6-2 2.4z"/>
      <path d="M7.2 16.2c1.4-1.3 2.7-1.9 4-1.9h2.4a1.3 1.3 0 0 1 0 2.6h-2.6"/>
      <path d="M8.6 19.6h4.6c2.5 0 5.3-1.9 7.6-3.9a1.3 1.3 0 0 0-1.6-2c-1.6 1-3 1.7-4.2 2.2"/>
    </g>`;
}

/** Volledige badge-SVG. Deterministisch: zelfde opties = zelfde markup. */
export function buildBadgeSvg(options: BadgeOptions): string {
  const { status, format, corners, theme } = options;
  const handle = options.handle.replace(/^@+/, "");
  const t = THEMES[theme];
  const label = BADGE_LABEL[status];
  const at = `@${handle}`;

  if (format === "compact") {
    const size = 44;
    const rx = corners === "rounded" ? size / 2 : 10;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(`${at} — ${label} op ROUT`)}">
  <rect x="0.75" y="0.75" width="${size - 1.5}" height="${size - 1.5}" rx="${rx}" fill="${t.bg}" stroke="${t.border}" stroke-width="1.5"/>
  <g transform="translate(10 10)">${badgeIconMarkup(status, theme)}</g>
</svg>`;
  }

  const height = 44;
  const textX = 44;
  const labelWidth = label.length * 5.4;
  const handleWidth = at.length * 7.6;
  const width = Math.round(Math.max(200, textX + Math.max(labelWidth, handleWidth) + 18));
  const rx = corners === "rounded" ? height / 2 : 6;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`${at} — ${label} op ROUT`)}">
  <rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="${rx}" fill="${t.bg}" stroke="${t.border}" stroke-width="1.5"/>
  <g transform="translate(12 10)">${badgeIconMarkup(status, theme)}</g>
  <text x="${textX}" y="18.5" font-family="ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif" font-size="8" font-weight="600" letter-spacing="1.1" fill="${t.muted}">${escapeXml(label)}</text>
  <text x="${textX}" y="32.5" font-family="ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="600" fill="${t.text}">${escapeXml(at)}</text>
</svg>`;
}

/** Query-string voor de publieke SVG-route. */
export function badgeQuery(options: Omit<BadgeOptions, "handle">) {
  return `type=${options.status}&format=${options.format}&corners=${options.corners}&theme=${options.theme}`;
}

const pick = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes((raw ?? "") as T) ? ((raw ?? "") as T) : fallback;

/** Opties uit URL-parameters, met veilige standaardwaarden. */
export function badgeOptionsFromParams(
  params: URLSearchParams,
  handle: string,
  fallbackStatus: BadgeStatus,
): BadgeOptions {
  return {
    handle,
    status: pick(params.get("type"), ["verified", "privacy_shield"] as const, fallbackStatus),
    format: pick(params.get("format"), ["pill", "compact"] as const, "pill"),
    corners: pick(params.get("corners"), ["rounded", "square"] as const, "rounded"),
    theme: pick(params.get("theme"), ["dark", "light", "glass"] as const, "dark"),
  };
}
