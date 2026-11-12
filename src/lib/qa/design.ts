import { parseDisplayPrefs } from "@/lib/profile-display";
import { designButtonStyle, fontPairingOf } from "@/lib/profile-design";
import { glassSurfaceStyle, resolveComponentDesign, type ComponentScope } from "@/lib/theme-engine";

/** Shared by the dedicated-page editor and live page; hub themes remain separate. */
export const QA_PAGE_SURFACE = { card: "hsl(var(--story-card))", border: "var(--border)", text: "hsl(var(--story-ink))", muted: "var(--muted-foreground)" };

export function qaDesign(raw: unknown, scope: ComponentScope, surface: { card: string; border: string; text: string; muted: string }) {
  const prefs = parseDisplayPrefs(raw);
  const d = resolveComponentDesign(prefs, prefs.themeOverrides, scope);
  const style = {
    ...(designButtonStyle({ ...d, buttonsCustom: d.buttonsCustom || d.hasButtonOverride }, { ...surface, bg: surface.card }) ?? {}),
    ...(d.typographyCustom || prefs.themeOverrides[scope]?.fontPairing ? { fontFamily: fontPairingOf(d.fontPairing).body } : {}),
    ...(glassSurfaceStyle(d, scope, prefs.glassTargets) ?? {}),
  };
  return clampWidgetRadius(style);
}

/** Forms and widgets can never become pills: a 999px radius clips their fields and buttons. */
export function clampWidgetRadius<T extends object>(style: T): T {
  const r = (style as { borderRadius?: unknown }).borderRadius;
  const px = typeof r === "number" ? r : typeof r === "string" ? parseFloat(r) : NaN;
  return Number.isFinite(px) && px > 28 ? { ...style, borderRadius: 28 } : style;
}