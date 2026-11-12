import { useState } from "react";
import { toast } from "sonner";
import { errorText, useConsoleApp, useSaveApp, useSaveSettings, type AppPatch, type SettingsPatch } from "./console-data";
import { i18n as trI18n } from "@/lib/i18n";

/** Shared hook for console sub-pages: the current app plus a save action with toasts. */
export function useAppPage(appId: string) {
  const { app } = useConsoleApp(appId);
  const save = useSaveApp();
  const [saving, setSaving] = useState(false);
  const persist = async (patch: AppPatch) => {
    if (!app) return false;
    setSaving(true);
    try {
      await save(app, patch);
      toast.success(trI18n.t("ui.f0b3057bb6"));
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveSettings = useSaveSettings();
  const persistSettings = async (patch: SettingsPatch) => {
    if (!app) return false;
    setSaving(true);
    try {
      await saveSettings(app, patch);
      toast.success(trI18n.t("ui.f0b3057bb6"));
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { app: app!, persist, persistSettings, saving };
}
