import { parseDisplayPrefs, type ProfileDisplayPrefs } from "./profile-display";

export type ShowcaseDisplay = Pick<ProfileDisplayPrefs, "canvasColor" | "avatarFrame" | "avatarDecoration" | "avatarShape" | "nameAccent" | "fontPairing" | "typographyCustom" | "customDesign" | "titleColor" | "titleGlow" | "badgeVisible" | "badgeType" | "badgeBackdrop" | "badgeBackdropColor">;

/** Only public presentation preferences leave the server, never the raw settings. */
export function showcaseDisplay(raw: unknown, business = false, influencer = false, domain = false): ShowcaseDisplay {
  const p = parseDisplayPrefs(raw);
  return {
    canvasColor: p.canvasColor,
    avatarFrame: p.avatarFrame, avatarDecoration: p.avatarDecoration, avatarShape: p.avatarShape,
    nameAccent: p.nameAccent, fontPairing: p.fontPairing, typographyCustom: p.typographyCustom,
    customDesign: p.customDesign, titleColor: p.titleColor, titleGlow: p.titleGlow,
    badgeVisible: p.badgeVisible, badgeBackdrop: p.badgeBackdrop, badgeBackdropColor: p.badgeBackdropColor,
    badgeType: business ? "domain" : influencer ? "influencer" : p.badgeType === "influencer" || (p.badgeType === "domain" && !domain) ? "verified" : p.badgeType,
  };
}