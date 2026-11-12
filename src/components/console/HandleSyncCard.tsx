import { useTranslation } from "react-i18next";
import { ConsoleCard } from "./ConsolePage";
import { Switch } from "@/components/ui/switch";
import type { ConsoleApp, AppPatch } from "./console-data";

/** Universal Handle Sync switch, shared by the Scopes and Advanced pages. */
export function HandleSyncCard({ app, saving, persist }: { app: ConsoleApp; saving: boolean; persist: (p: AppPatch) => Promise<boolean> }) {
  const { t } = useTranslation();
  const missingProfile = app.handleSyncEnabled && !app.scopes.includes("profile");
  return (
    <ConsoleCard title="Universal Handle Sync">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1">
          <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Premium</span>
          <p className="text-sm text-muted-foreground">{t("console.handleSync.body")}</p>
          <p className="text-xs text-muted-foreground">{t("console.handleSync.claim")}</p>
          {missingProfile && <p className="text-xs text-destructive">{t("console.handleSync.needsProfile")}</p>}
        </div>
        <Switch aria-label="Universal Handle Sync" checked={app.handleSyncEnabled} disabled={saving} onCheckedChange={(on) => persist({ handleSyncEnabled: on })} />
      </div>
    </ConsoleCard>
  );
}
