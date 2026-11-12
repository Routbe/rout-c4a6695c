/** Steam-styled QR defaults (pure). Brand mark from simple-icons; colours are QR content, not UI tokens. */
import { siSteam } from "simple-icons";

export const STEAM_QR_STYLE = { fgColor: "#171A21", dotStyle: "rounded" as const, logoSize: 0.3 };

/** Official Steam mark, white on a Steam-navy disc, as an SVG data URL for the QR centre. */
export function steamLogoDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 32"><circle cx="12" cy="12" r="16" fill="#171A21"/><path fill="#FFFFFF" d="${siSteam.path}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
