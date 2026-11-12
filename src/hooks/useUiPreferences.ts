import { createContext, useContext, useSyncExternalStore } from "react";
import { DEFAULT_UI_PREFERENCES, type UiPreferences } from "@/lib/internal-interface-theme";
import { getUiPreferences, subscribeUiPreferences } from "@/lib/ui-preferences-store";

/** Request-cookie preferences, so server HTML and hydration paint the same first frame. */
export const UiPreferencesSeed = createContext<UiPreferences>(DEFAULT_UI_PREFERENCES);

export function useUiPreferences(): UiPreferences {
  const seed = useContext(UiPreferencesSeed);
  return useSyncExternalStore(subscribeUiPreferences, getUiPreferences, () => seed);
}
