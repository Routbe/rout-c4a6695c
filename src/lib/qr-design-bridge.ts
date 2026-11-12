import type { ProfileQrStyle, QrCornerStyle } from "@/lib/profile-qr";
import { normalizeQrSettings } from "@/lib/qr-settings";
import { createContext } from "react";

/**
 * The /qr generator keeps its style in page state; the profile-hub picker sits
 * deep inside the form. Context binds its save action to this designer's
 * current render, never to another page instance or a delayed effect.
 */
export interface GeneratorDesign {
  fgColor: string;
  bgColor: string;
  dotStyle: string;
  outerCornerStyle?: string;
  innerCornerStyle?: string;
  bgGradient?: string | null;
  logo?: string | null;
  logoSize?: number;
  logoMargin?: number;
  hideBackgroundDots?: boolean;
}

export const ProfileQrDesignContext = createContext<ProfileQrStyle | null>(null);

/** Lets the profile-hub picker load a saved style (personal or workspace) into the designer. */
export const ProfileQrApplyContext = createContext<((style: ProfileQrStyle) => void) | null>(null);

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Maps generator styling onto the profile QR style stored in display_prefs.qrSettings. */
export function toProfileQrStyle(design: GeneratorDesign | null): ProfileQrStyle {
  const fg = design && HEX.test(design.fgColor) ? design.fgColor : "#1A1A1A";
  const bg = design && (HEX.test(design.bgColor) || design.bgColor === "transparent") ? design.bgColor : "#FFFFFF";
  const dot = design?.dotStyle ?? "square";
  const cornerStyle: QrCornerStyle = dot === "dots" ? "dots" : /round|classy/.test(dot) ? "smooth" : "square";
  const raw = {
    fgColor: fg,
    bgColor: bg,
    cornerStyle,
    emblem: false,
    dotStyle: dot,
    outerCornerStyle: design?.outerCornerStyle,
    innerCornerStyle: design?.innerCornerStyle,
    bgGradient: design?.bgGradient ?? null,
    logo: design?.logo ?? null,
    logoSize: design?.logoSize,
    logoMargin: design?.logoMargin,
    hideBackgroundDots: design?.hideBackgroundDots,
  };
  return normalizeQrSettings(raw) ?? { fgColor: fg, bgColor: bg, cornerStyle, emblem: false };
}

