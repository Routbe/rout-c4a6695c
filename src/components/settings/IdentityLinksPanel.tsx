import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { StepUpCodeField } from "./StepUpCodeField";
import { linkRelMeIdentity, listMyIdentityLinks, revokeIdentityLink, setIdentityLinkLogin } from "@/lib/identity/links.functions";
import type { IdentityLink } from "@/lib/identity/links.server";

/** Identity graph: proven identities, opt-in login, revoke. */
export function IdentityLinksPanel() {
  const list = useServerFn(listMyIdentityLinks);
  const linkRelMe = useServerFn(linkRelMeIdentity);
  const setLogin = useServerFn(setIdentityLinkLogin);
  const revoke = useServerFn(revokeIdentityLink);
  const [links, setLinks] = useState<IdentityLink[] | null>(null);
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLinks((await list()) as IdentityLink[]);
    } catch {
      setLinks([]);
    }
  }, [list]);
  useEffect(() => void refresh(), [refresh]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  const active = (links ?? []).filter((l) => l.status !== "revoked");

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-medium">Bewezen identiteiten</h2>
        <p className="text-sm text-muted-foreground">
          Een koppeling bewijst dat een account van jou is. Inloggen ermee staat pas aan als jij dat inschakelt.
        </p>
      </div>

      {links === null ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen bewezen identiteiten.</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{l.displayHandle ?? l.issuer}</p>
                <p className="text-xs text-muted-foreground">
                  {l.provider} · bewezen {new Date(l.lastVerifiedAt).toLocaleDateString()}
                </p>
              </div>
              {l.status === "disputed" && <Badge variant="destructive">Betwist</Badge>}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Inloggen
                <Switch
                  checked={l.loginEnabled}
                  disabled={busy || l.status !== "verified" || (!l.loginEnabled && code.length !== 6)}
                  onCheckedChange={(enabled) =>
                    run(() => setLogin({ data: { id: l.id, enabled, ...(enabled ? { code } : {}) } }), enabled ? "Inloggen ingeschakeld" : "Inloggen uitgeschakeld")
                  }
                />
              </label>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => revoke({ data: { id: l.id } }), "Koppeling ingetrokken")}>
                Intrekken
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-sm font-medium text-foreground">Website of fediverse-profiel koppelen</p>
        <p className="text-xs text-muted-foreground">
          Zet op je profielpagina een link met rel="me" naar je ROUT-pagina en plak hieronder het adres.
        </p>
        <Input placeholder="https://jouwsite.be" value={url} onChange={(e) => setUrl(e.target.value)} className="h-10" />
        <StepUpCodeField purpose="identity_link" value={code} onChange={setCode} />
        <p className="text-xs text-muted-foreground">De code is ook nodig om inloggen in te schakelen.</p>
        <Button
          disabled={busy || code.length !== 6 || url.length < 8}
          onClick={() => run(async () => { await linkRelMe({ data: { url: url.trim(), code } }); setUrl(""); }, "Identiteit gekoppeld")}
        >
          Koppelen
        </Button>
      </div>
    </section>
  );
}
