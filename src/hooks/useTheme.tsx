import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from "react";
import { useMatches, useRouterState } from "@tanstack/react-router";
import { isInternalInterface, type ColorMode, type InterfaceTheme } from "@/lib/internal-interface-theme";
import { setUiPreferences } from "@/lib/ui-preferences-store";
import { useUiPreferences } from "@/hooks/useUiPreferences";

/** What the user picked. 'system' follows the OS preference live. */
export type ThemeMode = ColorMode;
/** What is actually painted. */
export type ResolvedTheme = "light" | "dark";

type Ctx = {
  /** Resolved theme — use this for rendering decisions. */
  theme: ResolvedTheme;
  /** The user's choice, including 'system'. */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggleTheme: () => void;
  setTheme: (t: ResolvedTheme) => void;
  interfaceTheme: InterfaceTheme;
  setInterfaceTheme: (theme: InterfaceTheme) => void;
  internalUi: boolean;
};

const ThemeContext = createContext<Ctx | undefined>(undefined);
const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

/**
 * Colour mode and workspace material come from one device store. The <head>
 * boot script already painted both before hydration; effects only keep the
 * document in sync with later changes and never clear attributes in between.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { material: interfaceTheme, mode } = useUiPreferences();
  // Hydration starts from "light"; the effect corrects it without touching the already-correct <html>.
  const [systemDark, setSystemDark] = useState(false);
  const routeIds = useMatches({ select: matches => matches.map(match => match.routeId) });
  const pathname = useRouterState({ select: state => state.location.pathname });
  const internalUi = isInternalInterface(pathname, routeIds);

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    setSystemDark(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Layout effects: React may rewrite <html> attributes on mode/route change; repair before paint.
  useLayoutEffect(() => {
    const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }, [mode, systemDark]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (internalUi) {
      root.dataset["workspaceUi"] = "internal";
      root.dataset["theme"] = interfaceTheme;
    } else {
      delete root.dataset["workspaceUi"];
      delete root.dataset["theme"];
    }
  }, [internalUi, interfaceTheme]);

  const theme: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  const setMode = (next: ThemeMode) => setUiPreferences({ mode: next });
  const setInterfaceTheme = (next: InterfaceTheme) => setUiPreferences({ material: next });

  return (
    <ThemeContext.Provider value={{
      theme, mode, setMode, setTheme: setMode, interfaceTheme, setInterfaceTheme, internalUi,
      toggleTheme: () => setMode(theme === "dark" ? "light" : "dark"),
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
