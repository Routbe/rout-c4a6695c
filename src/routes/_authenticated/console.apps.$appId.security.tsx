import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { APPS_KEY, errorText } from "@/components/console/console-data";
import { useAppPage } from "@/components/console/useAppPage";
import { deleteOAuthClient } from "@/lib/oauth/console.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { i18n as trI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/security")({
  head: () => ({ meta: [{"title": "Security \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage security for your ROUT application."}, {"property": "og:title", "content": "Security \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage security for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: SecurityPage,
});

const TTLS = [
  { s: 900, label: "15 min" },
  { s: 3600, label: "1 hour" },
  { s: 14400, label: "4 hours" },
  { s: 86400, label: "24 hours" },
];

function SecurityPage() {
  const { appId } = Route.useParams();
  const { app, persistSettings, saving } = useAppPage(appId);
  const [ips, setIps] = useState(app.allowedIps.join("\n"));
  const [confirmName, setConfirmName] = useState("");
  const remove = useServerFn(deleteOAuthClient);
  const qc = useQueryClient();
  const navigate = useNavigate();

  return (
    <ConsolePage title="Security" description="PKCE, token lifetime, network restrictions and the danger zone.">
      <ConsoleCard title="Enforce PKCE (S256)">
        <div className="flex items-start gap-4">
          <p className="flex-1 text-sm text-muted-foreground">
            Required for SPAs and mobile apps. Turning it off is only allowed for confidential server apps that authenticate with their client secret at the token endpoint.
          </p>
          <Switch aria-label="Enforce PKCE" checked={app.requirePkce} disabled={saving || !app.hasSecret} onCheckedChange={(on) => persistSettings({ requirePkce: on })} />
        </div>
      </ConsoleCard>

      <ConsoleCard title="Token lifetime" description="How long access and ID tokens stay valid.">
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <Button key={t.s} variant={app.accessTokenTtl === t.s ? "default" : "outline"} size="sm" disabled={saving} onClick={() => persistSettings({ accessTokenTtl: t.s })}>
              {t.label}
            </Button>
          ))}
        </div>
      </ConsoleCard>

      <ConsoleCard title="IP restrictions" description="Only these server IPs may call the token endpoint. One exact IPv4/IPv6 address per line; empty = any.">
        <Textarea rows={4} className="font-mono text-xs" value={ips} onChange={(e) => setIps(e.target.value)} placeholder={"203.0.113.10\n2001:db8::1"} />
        <Button
          className="mt-3"
          size="sm"
          disabled={saving}
          onClick={() => persistSettings({ allowedIps: [...new Set(ips.split(/\s+/).map((s) => s.trim()).filter(Boolean))] })}
        >
          Save IP list
        </Button>
      </ConsoleCard>

      <section className="rounded-2xl border border-destructive/40 bg-card p-6">
        <h2 className="text-base font-medium text-destructive">Delete app</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All sign-ins through this app stop immediately. Type <span className="font-mono text-foreground">{app.name}</span> to confirm.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input className="max-w-xs" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Confirm app name" />
          <Button
            variant="destructive"
            disabled={confirmName !== app.name}
            onClick={async () => {
              try {
                await remove({ data: { id: app.id } });
                await qc.invalidateQueries({ queryKey: APPS_KEY });
                toast.success(trI18n.t("ui.11132d9e97"));
                navigate({ to: "/console/apps" });
              } catch (e) {
                toast.error(errorText(e, "Delete failed."));
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete app
          </Button>
        </div>
      </section>
    </ConsolePage>
  );
}
