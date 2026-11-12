import { createIsomorphicFn } from "@tanstack/react-start";
import { MATERIAL_COOKIE, MODE_COOKIE, parseColorMode, parseInterfaceTheme, parseUiCookies, type UiPreferences } from "@/lib/internal-interface-theme";

/** Preferences mirrored in cookies; lets SSR render the member's material and mode on the first frame. */
export const readRequestUiPreferences = createIsomorphicFn()
  .server(async (): Promise<UiPreferences> => {
    const { getCookie } = await import("@tanstack/react-start/server");
    return { material: parseInterfaceTheme(getCookie(MATERIAL_COOKIE)), mode: parseColorMode(getCookie(MODE_COOKIE)) };
  })
  .client(async (): Promise<UiPreferences> => parseUiCookies(document.cookie));
