import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { setUiPreferences } from "@/lib/ui-preferences-store";
import { getAccountUiMaterial, saveAccountUiMaterial } from "@/lib/ui-preferences.functions";

/**
 * Signed-in members carry their material across devices: the account value is
 * adopted once per sign-in, later device changes are written back. Failures
 * leave the device choice in place.
 */
export function UiPreferenceAccountSync() {
  const { user } = useAuth();
  const { material } = useUiPreferences();
  const adoptedFor = useRef<string | null>(null);
  // Bumped on every device change: a late account answer never beats a newer local choice.
  const version = useRef(0);
  const lastMaterial = useRef(material);
  if (lastMaterial.current !== material) { lastMaterial.current = material; version.current += 1; }
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) { adoptedFor.current = null; return; }
    if (adoptedFor.current === userId) return;
    const startedAt = version.current;
    getAccountUiMaterial().then(({ material: stored }) => {
      if (adoptedFor.current === userId) return;
      adoptedFor.current = userId;
      if (stored && version.current === startedAt) setUiPreferences({ material: stored });
      else void saveAccountUiMaterial({ data: { material: lastMaterial.current } }).catch(() => undefined);
    }).catch(() => { adoptedFor.current = userId; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || adoptedFor.current !== userId) return;
    void saveAccountUiMaterial({ data: { material } }).catch(() => undefined);
  }, [userId, material]);

  return null;
}
