import { withStepUp } from "@/components/auth/StepUpDialog";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { errorText } from "@/components/console/console-data";
import { useAppPage } from "@/components/console/useAppPage";
import { rotateOAuthSecret, setOAuthBackchannelWebhook } from "@/lib/oauth/console.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { i18n as trI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/credentials")({
  head: () => ({ meta: [{"title": "Credentials \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage credentials for your ROUT application."}, {"property": "og:title", "content": "Credentials \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage credentials for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: CredentialsPage,
});

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
        <code className="flex-1 break-all text-xs">{value}</code>
        <button type="button" aria-label={`Kopieer ${label}`} onClick={() => { navigator.clipboard.writeText(value); toast.success(trI18n.t("ui.d0954ac4f4")); }}>
          <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    </div>
  );
}

function CredentialsPage() {
  const { appId } = Route.useParams();
  const { app } = useAppPage(appId);
  const rotate = useServerFn(rotateOAuthSecret);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saveHook = useServerFn(setOAuthBackchannelWebhook);
  const [hookUrl, setHookUrl] = useState("");
  const [hookSecret, setHookSecret] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "https://rout.be" : window.location.origin;

  return (
    <ConsolePage title="Credentials" description="Sleutels waarmee je app zich bij ROUT aanmeldt.">
      <ConsoleCard>
        <div className="space-y-4">
          <CopyField label="Client ID" value={app.clientId} />
          {secret ? (
            <div className="space-y-2">
              <CopyField label="Nieuw client secret (wordt maar één keer getoond)" value={secret} />
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Client secret</p>
              <p className="text-sm">{app.hasSecret ? "••••••••••••••••  (verborgen, enkel bij aanmaak zichtbaar)" : "Nog geen secret"}</p>
            </div>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy}>
                <RefreshCw className="h-4 w-4" /> Secret vernieuwen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Secret vernieuwen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je dit secret wilt vernieuwen? Je huidige integraties zullen direct breken
                  tot je overal het nieuwe secret invult.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    setBusy(true);
                    try { setSecret((await withStepUp(() => rotate({ data: { id: app.id } }))).clientSecret); }
                    catch (e) { toast.error(errorText(e, "Vernieuwen mislukt.")); }
                    finally { setBusy(false); }
                  }}
                >
                  Ja, vernieuw het secret
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </ConsoleCard>
      <ConsoleCard title="E-mailwijzigingen (back-channel)">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ROUT stuurt een ondertekend <code>user.email_updated</code>-event (HMAC-SHA256, header <code>X-Rout-Signature: t=…,v1=…</code>) naar deze https-URL wanneer een gebruiker het e-mailadres voor je app wijzigt.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-0 flex-1" placeholder="https://jouwapp.be/webhooks/rout" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
            <Button disabled={busy || !hookUrl.startsWith("https://")} onClick={async () => {
              setBusy(true);
              try { setHookSecret((await saveHook({ data: { id: app.id, url: hookUrl.trim() } })).secret); toast.success(trI18n.t("ui.9c4f96217e")); }
              catch (e) { toast.error(errorText(e, "Opslaan mislukt.")); }
              finally { setBusy(false); }
            }}>Opslaan</Button>
            <Button variant="outline" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await saveHook({ data: { id: app.id, url: null } }); setHookSecret(null); toast.success(trI18n.t("ui.ed2795ef50")); }
              catch (e) { toast.error(errorText(e, "Verwijderen mislukt.")); }
              finally { setBusy(false); }
            }}>Verwijderen</Button>
          </div>
          {hookSecret && <CopyField label="Webhook-secret (wordt maar één keer getoond)" value={hookSecret} />}
        </div>
      </ConsoleCard>
      <ConsoleCard title="Endpoints">
        <div className="space-y-3">
          <CopyField label="Discovery" value={`${origin}/.well-known/openid-configuration`} />
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}
