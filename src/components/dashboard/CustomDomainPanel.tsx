import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, AtSign, CheckCircle2, Clock, Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/InfoHint";
import { DomainRootDestination } from "./DomainRootDestination";
import {
  DOMAIN_CNAME_TARGET,
  addCustomDomain,
  deleteCustomDomain,
  listCustomDomains,
  verifyCustomDomain,
  claimDomainAsHandle,
} from "@/lib/domains.functions";
import { i18n as trI18n } from "@/lib/i18n";

const STATUS_LABEL: Record<string, string> = {
  pending: "Bezig",
  pointing: "TXT gevonden",
  verified: "Geslaagd",
  error: "Fout",
};

interface DomainRow {
  id: string;
  domain: string;
  status: string;
  verification_token: string;
  root_redirect_type?: string | null;
  root_redirect_url?: string | null;
}

/**
 * Compacte domeinkoppeling in de Studio: zet `links.jouwmerk.com` via een CNAME
 * op je ROUT-profiel. Zodra de DNS klopt, serveert dat domein je profiel.
 */
export function CustomDomainPanel() {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = (await listCustomDomains({ data: undefined })) as unknown as DomainRow[];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live DNS-status: elke 15s stil opnieuw controleren zolang een domein niet geverifieerd is.
  const pendingIds = rows.filter((r) => r.status !== "verified").map((r) => r.id).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const timer = window.setInterval(async () => {
      for (const id of pendingIds.split(",")) {
        try {
          await verifyCustomDomain({ data: { id } });
        } catch {
          /* volgende poging */
        }
      }
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [pendingIds, refresh]);

  function copy(value: string) {
    void navigator.clipboard?.writeText(value).then(
      () => toast.success(trI18n.t("ui.d0954ac4f4")),
      () => toast.error(trI18n.t("ui.0b1c52dd95")),
    );
  }

  async function add() {
    const value = domain.trim().toLowerCase();
    if (!value) return;
    setBusy("add");
    try {
      await addCustomDomain({ data: { domain: value } });
      setDomain("");
      toast.success(trI18n.t("ui.e978476e5f"));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Toevoegen mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function verify(id: string) {
    setBusy(id);
    try {
      const res = await verifyCustomDomain({ data: { id } });
      toast[res.status === "verified" ? "success" : "message"](
        res.status === "verified"
          ? "Geverifieerd — je profiel is live op dit domein."
          : "DNS nog niet zichtbaar. Probeer over enkele minuten opnieuw.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verifiëren mislukt.");
    } finally {
      setBusy(null);
    }
  }

  /** Domein als handle gebruiken: rout.be/example.be, altijd na DNS-controle. */
  async function claimHandle(id: string) {
    setBusy(id);
    try {
      const res = await claimDomainAsHandle({ data: { id } });
      toast.success(`Je profiel staat nu ook op rout.be/${res.handle} — met de zwarte domeinbadge.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Claimen mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await deleteCustomDomain({ data: { id } });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verwijderen mislukt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" aria-hidden /> Eigen domein
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Wijs een subdomein met een CNAME naar{" "}
          <code className="font-mono">{DOMAIN_CNAME_TARGET}</code>. Na verificatie toont dat domein
          je profiel.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Een geverifieerd domein mag je ook als handle gebruiken:{" "}
          <code className="font-mono">rout.be/jouwmerk.be</code>.
          <InfoHint label="Wat is een DNS-zone?">
            Je DNS-zone is de instellingenlijst bij je domeinregistrar waar je records (CNAME, TXT)
            toevoegt. We controleren die records elke keer opnieuw voordat we een domein als handle
            toelaten.
          </InfoHint>
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="links.jouwmerk.com"
          aria-label="Eigen domein"
          maxLength={253}
        />
        <Button type="button" onClick={add} disabled={busy === "add" || !domain.trim()}>
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Toevoegen"}
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nog geen domein gekoppeld.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.domain}</span>
              <Badge
                variant={row.status === "verified" ? "default" : row.status === "error" ? "destructive" : "secondary"}
                className="gap-1"
              >
                {row.status === "verified" ? (
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                ) : row.status === "error" ? (
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                ) : (
                  <Clock className="h-3 w-3" aria-hidden />
                )}
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => verify(row.id)}
                disabled={busy === row.id}
                className="gap-1"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Controleer DNS
              </Button>
              {row.status === "verified" && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => claimHandle(row.id)}
                  disabled={busy === row.id}
                  className="gap-1"
                >
                  <AtSign className="h-3.5 w-3.5" aria-hidden /> Gebruik als handle
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(row.id)}
                disabled={busy === row.id}
                aria-label={`Verwijder ${row.domain}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
              {row.status === "verified" && (
                <DomainRootDestination id={row.id} domain={row.domain} type={row.root_redirect_type} url={row.root_redirect_url} />
              )}
              {row.status !== "verified" && (
                <div className="w-full space-y-1.5 rounded-md bg-muted p-2 text-xs">
                  <p className="text-muted-foreground">Maak deze records aan bij je domeinregistrar:</p>
                  {[
                    { type: "TXT", name: `_rout.${row.domain}`, value: `rout-verify=${row.verification_token}` },
                    { type: "CNAME", name: row.domain, value: DOMAIN_CNAME_TARGET },
                  ].map((rec) => (
                    <div key={rec.type} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2">
                      <span className="font-semibold">{rec.type}</span>
                      <span className="min-w-0 break-all font-mono">
                        {rec.name} → {rec.value}
                      </span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(rec.value)} aria-label={`Kopieer ${rec.type}-waarde`}>
                        <Copy className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> We controleren automatisch elke 15 seconden.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CustomDomainPanel;
