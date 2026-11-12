/**
 * Workspace materials and colour mode: independent from member artwork.
 * Device storage is the source of truth; a cookie mirror lets the server paint
 * the first frame correctly, and BOOT_SCRIPT repairs it before first paint.
 */
export type InterfaceTheme = "mechanical" | "glass";
export type ColorMode = "system" | "light" | "dark";
export type UiPreferences = { material: InterfaceTheme; mode: ColorMode };

export const INTERFACE_THEME_KEY = "rout-interface-theme";
export const COLOR_MODE_KEY = "qrcraft-theme";
export const MATERIAL_COOKIE = "rout-ui-material";
export const MODE_COOKIE = "rout-ui-mode";
export const DEFAULT_INTERFACE_THEME: InterfaceTheme = "mechanical";
export const DEFAULT_UI_PREFERENCES: UiPreferences = { material: DEFAULT_INTERFACE_THEME, mode: "system" };

/** Legacy "creator" was the glass material; legacy "sovereign" becomes Mechanical. */
export function parseInterfaceTheme(value: unknown): InterfaceTheme {
  return value === "glass" || value === "creator" ? "glass" : DEFAULT_INTERFACE_THEME;
}

export function parseColorMode(value: unknown): ColorMode {
  return value === "light" || value === "dark" ? value : "system";
}

export function parseUiCookies(header: string | null | undefined): UiPreferences {
  const jar = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) jar.set(part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1).trim()));
  }
  return { material: parseInterfaceTheme(jar.get(MATERIAL_COOKIE)), mode: parseColorMode(jar.get(MODE_COOKIE)) };
}

export function isInternalInterface(pathname: string, routeIds: readonly string[]): boolean {
  return routeIds.some(id => id.startsWith("/_authenticated")) ||
    ["/studio", "/studio/grid", "/qr", "/dev/material-lab"].includes(pathname);
}

/**
 * Runs synchronously in <head>, before the body paints. Applies the stored
 * colour mode everywhere and the stored material only where the server marked
 * the document as workspace UI; refreshes the cookie mirror for the next SSR.
 */
export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s=localStorage,m=s.getItem(${JSON.stringify(INTERFACE_THEME_KEY)}),c=s.getItem(${JSON.stringify(COLOR_MODE_KEY)});
m=(m==="glass"||m==="creator")?"glass":"mechanical";c=(c==="light"||c==="dark")?c:"system";
var dark=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";
if(d.getAttribute("data-workspace-ui")==="internal")d.setAttribute("data-theme",m);
var a="; path=/; max-age=31536000; samesite=lax";document.cookie=${JSON.stringify(MATERIAL_COOKIE)}+"="+m+a;document.cookie=${JSON.stringify(MODE_COOKIE)}+"="+c+a;}catch(e){}})();`;
