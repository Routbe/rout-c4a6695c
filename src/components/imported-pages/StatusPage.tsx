import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

type Health = { status: "operational" | "degraded"; latency_ms: number };
type State = "loading" | "operational" | "degraded";

const COMPONENTS: { key: string; name: string; body: string; live: boolean }[] = [
  {
    key: "db",
    name: "Database (Neon, EU)",
    body: "Profielen, korte links en QR-codes. Live gemeten via een leesquery.",
    live: true,
  },
  {
    key: "relay",
    name: "SecureShield™ mailrelays",
    body: "Doorsturen van @rout.be- en @u.rout.be-adressen naar je echte mailbox.",
    live: false,
  },
  {
    key: "payments",
    name: "Betaalgateways",
    body: "Kaart, Bancontact, iDEAL, Apple Pay en bankoverschrijving.",
    live: false,
  },
];

function StatusPill({ state }: { state: State }) {
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Controleren
      </span>
    );
  }
  if (state === "degraded") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" aria-hidden /> Verstoord
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" aria-hidden /> Operationeel
    </span>
  );
}

/**
 * Publiek statusoverzicht. De databasestatus komt live van de health-probe;
 * de overige diensten volgen diezelfde probe zolang er geen aparte meting is,
 * zodat we nooit "operationeel" tonen terwijl de app zelf onbereikbaar is.
 */
export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<State>("loading");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/public/health", { cache: "no-store" });
        const json = (await res.json()) as Health;
        if (cancelled) return;
        setHealth(json);
        setState(json.status === "operational" ? "operational" : "degraded");
      } catch {
        if (!cancelled) setState("degraded");
      }
      if (!cancelled) setCheckedAt(new Date().toLocaleTimeString("nl-BE"));
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <AppLayout crumbs={[{ label: "Status" }]}>
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <span className="eyebrow">Systeemstatus</span>
        <h1 className="mb-3 mt-2 font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          Draait alles?
        </h1>
        <p className="mb-10 border-b-2 border-dashed border-border-ink/25 pb-8 font-sans text-lg text-muted-foreground">
          Deze pagina meet onze eigen infrastructuur en zet niets bij jou neer: geen cookie, geen
          meetpixel, geen bezoekersprofiel.
        </p>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div>
            <p className="font-serif text-xl font-semibold text-foreground">
              {state === "degraded" ? "Er is een verstoring" : "Alle systemen operationeel"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {checkedAt ? `Laatst gecontroleerd om ${checkedAt}` : "Meting loopt…"}
              {health ? ` · antwoordtijd ${health.latency_ms} ms` : ""}
            </p>
          </div>
          <StatusPill state={state} />
        </div>

        <ul className="space-y-3">
          {COMPONENTS.map((component) => (
            <li
              key={component.key}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 p-5 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{component.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{component.body}</p>
                {!component.live && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Afgeleid van de algemene applicatiecheck.
                  </p>
                )}
              </div>
              <StatusPill state={state} />
            </li>
          ))}
        </ul>
      </div>
    </AppLayout>
  );
}
