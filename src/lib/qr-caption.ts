/**
 * URL caption under a QR code.
 *
 * The QR itself keeps encoding whatever the studio built (often a branded
 * destination), while the caption prints the human-readable short link, e.g.
 * `rout.be/s/29a94k`. Printing the link text next to the code gives people a
 * way in without a camera and is composited into every export so the download
 * matches the preview exactly.
 */

export const CAPTION_MAX_LENGTH = 32;

/** Strip protocol and trailing slash so the caption stays short. */
export function prettyCaption(url: string): string {
  return (url || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

/**
 * Captions must stay readable at print size, so anything longer than
 * CAPTION_MAX_LENGTH is shortened in the middle (`rout.be/s/…/campaign`).
 * The full link stays available as a tooltip / link target.
 */
export function truncateCaption(text: string, max = CAPTION_MAX_LENGTH): string {
  const value = (text || "").trim();
  if (value.length <= max) return value;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${value.slice(0, head)}…${tail > 0 ? value.slice(-tail) : ""}`;
}

/** Absolute href for a caption, so the preview text can be clicked. */
export function captionHref(text: string): string | null {
  const value = (text || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return null;
  return `https://${value}`;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Caption band height as a fraction of the QR edge. */
export const CAPTION_BAND_RATIO = 0.17;

export interface CaptionSvgOpts {
  /** Data URL of the rendered QR (png or svg). */
  qrHref: string;
  /** QR edge length in user units. */
  size: number;
  text: string;
  color: string;
  /** Paper colour; `transparent` leaves the band see-through. */
  bg: string;
  fontFamily?: string;
}

/** Compose the QR plus a caption band into one standalone SVG document. */
export function captionSvg({ qrHref, size, text, color, bg, fontFamily }: CaptionSvgOpts): {
  svg: string;
  width: number;
  height: number;
} {
  const band = Math.round(size * CAPTION_BAND_RATIO);
  const height = size + band;
  const fontSize = Math.round(band * 0.42);
  const family = fontFamily ?? "ui-sans-serif, system-ui, sans-serif";
  const paper =
    bg && bg !== "transparent" ? `<rect width="${size}" height="${height}" fill="${bg}" />` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${height}" width="${size}" height="${height}">${paper}<image href="${qrHref}" x="0" y="0" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" /><text x="${size / 2}" y="${size + band * 0.62}" text-anchor="middle" fill="${color}" font-family="${family}" font-size="${fontSize}" font-weight="600" letter-spacing="${Math.round(fontSize * 0.04)}">${escapeXml(text)}</text></svg>`;
  return { svg, width: size, height };
}
