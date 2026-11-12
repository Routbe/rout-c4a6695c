import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { ConsolePage } from "@/components/console/ConsolePage";
import { APPS_KEY, errorText, useConsoleApps, type ConsoleApp } from "@/components/console/console-data";
import { AppLogo } from "@/components/console/AppLogo";
import { deleteOAuthClient } from "@/lib/oauth/console.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { i18n as trI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/console/apps/")({
  head: () => ({ meta: [
    { title: "Je apps — ROUT Developer Console" },
    { name: "description", content: "Beheer jouw apps en hun Login met ROUT-instellingen." },
    { property: "og:title", content: "Je apps — ROUT Developer Console" },
    { property: "og:description", content: "Beheer jouw apps en hun Login met ROUT-instellingen." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: AppsOverview,
});

function AppsOverview() {
  const { data, isLoading, error } = useConsoleApps();
  const [toDelete, setToDelete] = useState<ConsoleApp | null>(null);
  const remove = useServerFn(deleteOAuthClient);
  const qc = useQueryClient();

  return (
    <ConsolePage
      title="Je apps"
      description="Alle apps die 'Login met ROUT' gebruiken."
      actions={<Button asChild><Link to="/console/apps/new"><Plus className="h-4 w-4" /> Nieuwe app</Link></Button>}
    >
      {isLoading && <p className="text-sm text-muted-foreground">Apps laden…</p>}
      {error && <p className="text-sm text-destructive">{errorText(error, "Apps konden niet geladen worden.")}</p>}
      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Nog geen apps. Maak je eerste app aan.</p>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((app) => (
            <div key={app.id} className="group relative rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/30">
              <Link to="/console/apps/$appId/credentials" params={{ appId: app.id }} className="absolute inset-0" aria-label={`Open ${app.name}`} />
              <div className="flex items-start gap-3">
                <AppLogo app={app} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{app.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{app.clientId}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setToDelete(app)}
                  className="relative z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Verwijder ${app.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                  {app.flowPreference === "strict" ? <ShieldCheck className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                  {app.flowPreference === "strict" ? "Strict" : "Seamless"}
                </span>
                {app.richIdentityEnabled && <span className="rounded-full border border-border px-2 py-0.5">Rich Identity</span>}
                <span className="rounded-full border border-border px-2 py-0.5">{app.redirectUris.length} redirect(s)</span>
              </div>
            </div>
          ))}
        </div>
      )}


      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toDelete?.name} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Gebruikers kunnen daarna niet meer inloggen via deze app. Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!toDelete) return;
                try {
                  await remove({ data: { id: toDelete.id } });
                  await qc.invalidateQueries({ queryKey: APPS_KEY });
                  toast.success(trI18n.t("ui.d7fe6d5ee2"));
                } catch (e) {
                  toast.error(errorText(e, "Verwijderen mislukt."));
                }
                setToDelete(null);
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConsolePage>
  );
}
