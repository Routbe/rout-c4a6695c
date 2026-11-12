import type { ProfileQrStyle, QrCornerStyle } from "@/lib/profile-qr";
import { validQrGradient } from "@/lib/qr-background";

/** Standaard ROUT-stijl (gelijk aan DEFAULT_PROFILE_QR_STYLE, zonder de QR-engine te importeren). */
export const ROUT_QR_DEFAULT: ProfileQrStyle = {
  fgColor: "#1A1A1A",
  bgColor: "#FFFFFF",
  cornerStyle: "square",
  emblem: false,
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CORNERS: QrCornerStyle[] = ["square", "dots", "smooth"];

/** Valideert opgeslagen QR-stijl uit `display_prefs.qrSettings`; leeg/ongeldig object = null. */
export function normalizeQrSettings(raw: unknown): ProfileQrStyle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).length === 0) return null;
  const fg = typeof r["fgColor"] === "string" && HEX.test(r["fgColor"]) ? r["fgColor"] : ROUT_QR_DEFAULT.fgColor;
  const bg = typeof r["bgColor"] === "string" && (HEX.test(r["bgColor"]) || r["bgColor"] === "transparent") ? r["bgColor"] : ROUT_QR_DEFAULT.bgColor;
  const corner = CORNERS.includes(r["cornerStyle"] as QrCornerStyle)
    ? (r["cornerStyle"] as QrCornerStyle)
    : ROUT_QR_DEFAULT.cornerStyle;
  const str = (k: string, re: RegExp) => (typeof r[k] === "string" && re.test(r[k] as string) ? (r[k] as string) : undefined);
  const SHAPE = /^[a-z-]{2,20}$/;
  const dotStyle = str("dotStyle", SHAPE);
  const outerCornerStyle = str("outerCornerStyle", SHAPE);
  const innerCornerStyle = str("innerCornerStyle", SHAPE);
  const bgGradient = typeof r["bgGradient"] === "string" && validQrGradient(r["bgGradient"]) ? r["bgGradient"] : undefined;
  const logo =
    typeof r["logo"] === "string" &&
    (/^https:\/\/[^\s"'<>]{1,500}$/.test(r["logo"]) ||
      (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r["logo"]) && r["logo"].length <= 200_000))
      ? r["logo"]
      : undefined;
  // Konijn alleen als expliciet opgeslagen; nooit meer standaard.
  const emblem = r["emblem"] === true && !logo ? true : false;
  const bounded = (key: string, min: number, max: number) =>
    typeof r[key] === "number" && Number.isFinite(r[key]) && r[key] >= min && r[key] <= max ? r[key] as number : undefined;
  return { fgColor: fg, bgColor: bg, cornerStyle: corner, emblem, dotStyle, outerCornerStyle, innerCornerStyle, bgGradient, logo,
    logoSize: bounded("logoSize", 0, 1), logoMargin: bounded("logoMargin", 0, 100),
    hideBackgroundDots: typeof r["hideBackgroundDots"] === "boolean" ? r["hideBackgroundDots"] : undefined };
}
