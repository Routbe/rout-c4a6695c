import {
  COLOR_MODE_KEY, DEFAULT_UI_PREFERENCES, INTERFACE_THEME_KEY, MATERIAL_COOKIE, MODE_COOKIE,
  parseColorMode, parseInterfaceTheme, parseUiCookies, type UiPreferences,
} from "@/lib/internal-interface-theme";

/** Device-wide preference store shared by the document shell and ThemeProvider. */
type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: UiPreferences | null = null;
let listening = false;

function readDevice(): UiPreferences {
  if (typeof window === "undefined") return DEFAULT_UI_PREFERENCES;
  const fromCookie = parseUiCookies(document.cookie);
  try {
    const material = localStorage.getItem(INTERFACE_THEME_KEY);
    const mode = localStorage.getItem(COLOR_MODE_KEY);
    return {
      material: material === null ? fromCookie.material : parseInterfaceTheme(material),
      mode: mode === null ? fromCookie.mode : parseColorMode(mode),
    };
  } catch { return fromCookie; }
}

function writeDevice(prefs: UiPreferences) {
  try {
    localStorage.setItem(INTERFACE_THEME_KEY, prefs.material);
    localStorage.setItem(COLOR_MODE_KEY, prefs.mode);
  } catch { /* Storage denial keeps the live, in-memory choice. */ }
  const attrs = "; path=/; max-age=31536000; samesite=lax";
  document.cookie = `${MATERIAL_COOKIE}=${prefs.material}${attrs}`;
  document.cookie = `${MODE_COOKIE}=${prefs.mode}${attrs}`;
}

function emit() { for (const listener of listeners) listener(); }

export function getUiPreferences(): UiPreferences {
  return (snapshot ??= readDevice());
}

export function setUiPreferences(patch: Partial<UiPreferences>) {
  const next = { ...getUiPreferences(), ...patch };
  if (next.material === snapshot?.material && next.mode === snapshot?.mode) return;
  snapshot = next;
  writeDevice(next);
  emit();
}

export function subscribeUiPreferences(listener: Listener) {
  listeners.add(listener);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", event => {
      if (event.key !== null && event.key !== INTERFACE_THEME_KEY && event.key !== COLOR_MODE_KEY) return;
      if (event.key === null) {
        // Storage was cleared in another tab: drop the cookie mirror too, so the
        // server and this tab fall back to the default instead of a stale choice.
        const gone = "; path=/; max-age=0; samesite=lax";
        document.cookie = `${MATERIAL_COOKIE}=${gone}`;
        document.cookie = `${MODE_COOKIE}=${gone}`;
        snapshot = { ...DEFAULT_UI_PREFERENCES };
      } else {
        snapshot = readDevice();
      }
      emit();
    });
  }
  return () => { listeners.delete(listener); };
}

/** Test seam: forget the cached snapshot so the next read hits device storage. */
export function resetUiPreferencesForTests() { snapshot = null; }
