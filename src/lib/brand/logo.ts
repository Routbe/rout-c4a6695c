import logoSvg from "@/assets/rout-logo.svg?raw";

/**
 * Enige bron van het officiële ROUT-konijn. Elke kaart, favicon en elk
 * persbestand gebruikt exact deze vectorvorm; enkel kleur, achtergrond en
 * wel/geen cirkels mogen verschillen. Nooit een ander konijn tekenen.
 */
const viewBoxMatch = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(logoSvg);
/** Read from the canonical file so a re-traced logo is never cropped. */
export const LOGO_VIEWBOX = {
  width: viewBoxMatch ? Number(viewBoxMatch[1]) : 2048,
  height: viewBoxMatch ? Number(viewBoxMatch[2]) : 2048,
} as const;

/** Inhoud van het logo (de `<g>` met het pad), zonder de buitenste `<svg>`. */
export const LOGO_INNER = logoSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/fill="#000000"/g, "");

export const BRAND = {
  purple: "#7026E1",
  mint: "#41DB97",
  ink: "#131211",
  paper: "#FFFFFF",
} as const;

/** Konijn op positie (x, y) met breedte `w` in kleur `color`. */
export function bunny(x: number, y: number, w: number, color: string) {
  const h = (w * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}"><g fill="${color}">${LOGO_INNER}</g></svg>`;
}

/** Officiële social-avatar-variant: konijn binnen paarse en mintgroene ring. */
export function bunnyWithRings(cx: number, cy: number, r: number, color: string = BRAND.ink, bg?: string) {
  const sw = r * 0.045;
  const bw = r * 0.82;
  const bh = (bw * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  return `${bg ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>` : ""}<circle cx="${cx}" cy="${cy}" r="${r - sw / 2}" fill="none" stroke="${BRAND.purple}" stroke-width="${sw}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="none" stroke="${BRAND.mint}" stroke-width="${sw}"/>${bunny(cx - bw / 2, cy - bh / 2 - r * 0.02, bw, color)}`;
}
