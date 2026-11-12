import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Landmark, Link2, Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { bunqOAuthStatus, disconnectBunqOAuth, startBunqOAuth } from "@/lib/bunq-oauth.functions";
import { i18n as trI18n } from "@/lib/i18n";

interface Status {
  configured: boolean;
  linked: boolean;
  environment: string;
  scope: string | null;
}

/**
 * Minimalistisch statuspaneel voor de bunq-OAuth-koppeling: toont of er een
 * persoonlijk bunq-account gekoppeld is en biedt koppelen/ontkoppelen.
 */
export function BunqConnectionPanel() {
  const { user } = useAuth();
  const loadStatus = useServerFn(bunqOAuthStatus);
  const start = useServerFn(startBunqOAuth);
  const disconnect = useServerFn(disconnectBunqOAuth);

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = (await loadStatus()) as Status;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  // Terugkeer uit de bunq-callback: ?bunq=linked|failed
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = new URLSearchParams(window.location.search).get("bunq");
    if (!flag) return;
    if (flag === "linked") toast.success(trI18n.t("ui.2fdadf959c"));
    if (flag === "failed") toast.error(trI18n.t("ui.437551c725"));
    const url = new URL(window.location.href);
    url.searchParams.delete("bunq");
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!user || loading || !status?.configured) return null;

  const onLink = async () => {
    setBusy(true);
    try {
      const res = await start();
      if (res.ok && "url" in res) window.location.href = res.url;
      else toast.error(trI18n.t("ui.78fbc46243"));
    } catch {
      toast.error(trI18n.t("ui.c10f9d0e3d"));
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async () => {
    setBusy(true);
    try {
      await disconnect();
      toast.success(trI18n.t("ui.cc305fb467"));
      await refresh();
    } catch {
      toast.error(trI18n.t("ui.4a49998165"));
    } finally {
      setBusy(false);
    }
  };

  // Tijdelijk inactief: koppelen staat uit tot de bunq-integratie opnieuw live gaat.
  return (
    <section className="pointer-events-none rounded-2xl border border-border bg-card p-4 opacity-60 sm:p-5">
      <p className="mb-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
        Tijdelijk inactief
      </p>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            bunq
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.linked
              ? "Je bunq-account is gekoppeld via de officiele bunq-inlog."
              : "Koppel je bunq-account om betalingen op jouw naam te laten lopen."}
          </p>
        </div>
        {status.linked ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Gekoppeld
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Omgeving</dt>
          <dd className="mt-0.5">{status.environment}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rechten</dt>
          <dd className="mt-0.5 truncate">{status.scope ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {status.linked ? (
          <Button variant="outline" size="sm" onClick={onUnlink} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2Off className="mr-2 h-3.5 w-3.5" />
            )}
            Ontkoppelen
          </Button>
        ) : (
          <Button size="sm" onClick={onLink} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-3.5 w-3.5" />
            )}
            bunq-account koppelen
          </Button>
        )}
      </div>
    </section>
  );
}
