import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import type { SwitchMode } from "@/lib/integration-switches";
import { adminFlushIntegrationCache, adminListSwitches, adminSetSwitch } from "@/lib/integration-switches.functions";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({
    meta: [
      { title: "Koppelingen schakelkast | ROUT beheer" },
      { name: "description", content: "Zet koppelingen platformbreed aan, op pauze of uit en leeg hun cache." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Koppelingen schakelkast | ROUT beheer" },
      { property: "og:description", content: "Zet koppelingen platformbreed aan, op pauze of uit en leeg hun cache." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsSwitchboard,
});

type Data = Awaited<ReturnType<typeof adminListSwitches>>;
const MODES: { mode: SwitchMode; label: string }[] = [
  { mode: "on", label: "Aan" },
  { mode: "paused", label: "Pauze" },
  { mode: "off", label: "Uit" },
];

function IntegrationsSwitchboard() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminListSwitches());
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const modeOf = (p: string): SwitchMode => data?.switches.find((s) => s.provider === p)?.mode ?? "on";

  async function set(provider: string, mode: SwitchMode) {
    const note = mode === "on" ? null : window.prompt("Reden (optioneel)") ?? null;
    setBusy(provider);
    try {
      await adminSetSwitch({ data: { provider, mode, note } });
      notifySuccess("Opgeslagen");
      await load();
    } catch {
      notifyError("Opslaan mislukt");
    } finally {
      setBusy(null);
    }
  }
  async function flush(provider: string) {
    setBusy(provider);
    try {
      await adminFlushIntegrationCache({ data: { provider } });
      notifySuccess("Cache geleegd");
    } catch {
      notifyError("Legen mislukt");
    } finally {
      setBusy(null);
    }
  }

  const list = INTEGRATIONS.filter((i) => i.mode !== "soon" && i.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <AppLayout
      title="Koppelingen schakelkast"
      description="Pauze: kaarten tonen de laatst bekende gegevens en nieuwe koppelingen zijn dicht. Uit: overal verborgen."
      crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Koppelingen" }]}
      width="wide"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">Je hebt geen recht om koppelingen te beheren.</p>
      ) : (
        <>
          <Input placeholder="Zoek koppeling…" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-4 max-w-sm" />
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {list.map((i) => {
              const current = modeOf(i.id);
              const sw = data?.switches.find((s) => s.provider === i.id);
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {data?.linkCounts[i.id] ?? 0} koppelingen
                      {sw?.note ? ` · ${sw.note}` : ""}
                      {sw?.updatedBy ? ` · door ${sw.updatedBy}` : ""}
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-border p-0.5">
                    {MODES.map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        disabled={busy === i.id}
                        onClick={() => current !== m.mode && set(i.id, m.mode)}
                        className={cn(
                          "rounded-md px-3 py-1 text-xs",
                          current === m.mode
                            ? m.mode === "off" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => flush(i.id)}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Cache legen
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppLayout>
  );
}
