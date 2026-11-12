import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { useAppPage } from "@/components/console/useAppPage";
import { cleanRedirectUri } from "@/lib/oauth/redirect-match";
import { redirectError } from "@/lib/oauth/redirect-rules";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { errorText } from "@/components/console/console-data";
import { listOAuthDebugEvents } from "@/lib/oauth/console.functions";
import { hintFor } from "@/lib/oauth/debug-hints";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/auth-logs")({
  head: () => ({ meta: [{ title: "Auth-logs — ROUT Developer Console" }, { name: "description", content: "Inspecteer ROUT OIDC-loginresultaten en configuratiefouten." }, { property: "og:title", content: "Auth-logs — ROUT Developer Console" }, { property: "og:description", content: "Inspecteer ROUT OIDC-loginresultaten en configuratiefouten." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AuthLogsPage,
});

function AuthLogsPage() {
  const { appId } = Route.useParams();
  const [paused, setPaused] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const list = useServerFn(listOAuthDebugEvents);
  const { app, persist, saving } = useAppPage(appId);
  const addRedirect = async (raw: string) => {
    const uri = cleanRedirectUri(raw);
    if (redirectError(uri, app.redirectUris)) return;
    await persist({ redirectUris: [...app.redirectUris, uri] });
  };
  const { data, error } = useQuery({
    queryKey: ["console", "auth-logs", appId, errorsOnly],
    queryFn: () => list({ data: { id: appId, errorsOnly } }),
    refetchInterval: paused ? false : 3000,
    retry: false,
  });

  return (
    <ConsolePage
      title="Auth-logs"
      description="Live overzicht van login-pogingen van de laatste 7 dagen, met de oplossing bij elke fout. Zonder IP-adressen, tokens of gebruikersgegevens."
      actions={
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={errorsOnly} onCheckedChange={setErrorsOnly} /> Enkel fouten</label>
          <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? "Hervat" : "Pauzeer"}
          </Button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-xl border border-border bg-background font-mono text-xs">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", paused ? "bg-muted-foreground" : "animate-pulse bg-primary")} />
          {paused ? "gepauzeerd" : "live · elke 3 s"}
        </div>
        <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {error && <p className="p-4 text-destructive">{errorText(error, "Logs konden niet geladen worden.")}</p>}
          {data?.length === 0 && <p className="p-4 text-muted-foreground">Nog geen pogingen. Start een login vanuit je app — hij verschijnt hier meteen.</p>}
          {data?.map((e) => {
            const hint = e.outcome === "error" ? hintFor(e.errorCode, e.detail.message) : null;
            return (
              <div key={e.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleTimeString()}</span>
                  <span className="uppercase">{e.endpoint}</span>
                  <span className={e.outcome === "error" ? "text-destructive" : "text-primary"}>{e.outcome === "error" ? `✗ ${e.errorCode}` : "✓ ok"}</span>
                  {e.detail.redirectUri && <span className="text-muted-foreground">redirect={e.detail.redirectUri}</span>}
                  {e.detail.hasPkce !== undefined && <span className="text-muted-foreground">pkce={e.detail.hasPkce ? (e.detail.pkceMethod ?? "yes") : "none"}</span>}
                  {e.detail.scopes && <span className="text-muted-foreground">scope="{e.detail.scopes.join(" ")}"</span>}
                </div>
                {hint && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 font-sans text-sm">
                    <p className="font-medium">{hint.title}</p>
                    <p className="text-muted-foreground">{hint.fix}</p>
                    {e.errorCode === "invalid_redirect_uri" && e.detail.redirectUri && !app.redirectUris.includes(cleanRedirectUri(e.detail.redirectUri)) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button size="sm" disabled={saving || Boolean(redirectError(cleanRedirectUri(e.detail.redirectUri), app.redirectUris))} onClick={() => addRedirect(e.detail.redirectUri!)}>
                          Voeg deze URI toe aan Redirects
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Hoort dit adres bij een andere app? Controleer dan de client_id in je code.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ConsolePage>
  );
}
