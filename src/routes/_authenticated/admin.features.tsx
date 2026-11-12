import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Power } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { adminListPlatformFeatures, adminSetPlatformFeature } from "@/lib/admin-platform.functions";
import { PLATFORM_FEATURES, type PlatformFeatureId } from "@/lib/platform-features";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/features")({
  head: () => ({
    meta: [
      { title: "Functies aan/uit | ROUT beheer" },
      { name: "description", content: "Zet platformfuncties zoals Q&A, gastenboek, boekingen en fooien centraal aan of uit." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Functies aan/uit | ROUT beheer" },
      { property: "og:description", content: "Zet platformfuncties zoals Q&A, gastenboek, boekingen en fooien centraal aan of uit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeaturesPage,
});

type Row = Awaited<ReturnType<typeof adminListPlatformFeatures>>[number];

function FeaturesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminListPlatformFeatures();
      setRows(data);
      setNotes(Object.fromEntries(data.map((r) => [r.feature, r.note ?? ""])));
    } catch {
      setDenied(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const byId = new Map((rows ?? []).map((r) => [r.feature, r]));
  const groups = [...new Set(PLATFORM_FEATURES.map((f) => f.group))];

  const toggle = async (feature: PlatformFeatureId, enabled: boolean) => {
    setBusy(feature);
    try {
      await adminSetPlatformFeature({ data: { feature, enabled, note: notes[feature]?.trim() || null } });
      notifySuccess(enabled ? "Functie aangezet." : "Functie uitgezet voor het hele platform.");
      await load();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppLayout
      title="Functies aan/uit"
      description="Centrale schakelaars voor het hele platform. Een uitgezette functie wordt op de server geweigerd binnen ±30 seconden. Per-lid blokkades staan in Leden 360°; koppelingen in de Schakelkast."
      crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Functies aan/uit" }]}
      width="wide"
    >
      {denied ? (
        <p className="text-sm text-muted-foreground">Alleen volledige beheerders kunnen platformfuncties wijzigen.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h2>
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                {PLATFORM_FEATURES.filter((f) => f.group === group).map((f) => {
                  const row = byId.get(f.id);
                  const enabled = row ? row.enabled : true;
                  return (
                    <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Power className={enabled ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} aria-hidden />
                          {f.label}
                          {!enabled && <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive">Uit</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{f.description}</p>
                        {row?.updatedAt && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Laatst gewijzigd {new Date(row.updatedAt).toLocaleString("nl-BE")}{row.updatedBy ? ` door ${row.updatedBy}` : ""}
                          </p>
                        )}
                      </div>
                      <Input
                        className="h-9 sm:w-64"
                        placeholder="Reden (optioneel, in audit)"
                        aria-label={`Reden voor ${f.label}`}
                        maxLength={300}
                        value={notes[f.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))}
                      />
                      <Switch
                        checked={enabled}
                        disabled={rows === null || busy === f.id}
                        onCheckedChange={(on) => void toggle(f.id, on)}
                        aria-label={`${f.label} ${enabled ? "uitzetten" : "aanzetten"}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
