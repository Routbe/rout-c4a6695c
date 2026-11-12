import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEnvHealth } from "@/lib/env-health.functions";

/** "Environment & API Health Status" — groen/rood per externe dienst. */
export function EnvHealthPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "env-health"],
    queryFn: () => getEnvHealth(),
    staleTime: 60_000,
  });

  const login = useQuery({
    queryKey: ["admin", "auth-diagnose"],
    queryFn: async () => {
      const r = await fetch("/api/public/auth/providers?diagnose=1");
      return (await r.json()) as {
        baseUrl: string;
        coreReady: boolean;
        core: Record<string, boolean>;
        providers: { id: string; configured: boolean; missing: string[]; callbackUrl: string }[];
      };
    },
    staleTime: 60_000,
  });

  return (
    <section className="rounded-2xl border border-border/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Environment &amp; API Health Status</h3>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Opnieuw testen
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Diensten testen…</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {(data?.services ?? []).map((s) => (
            <li
              key={s.key}
              className="flex items-start gap-2 rounded-xl border border-border/60 p-2.5 text-xs"
            >
              {s.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
              )}
              <span>
                <span className="block font-medium text-foreground">{s.label}</span>
                <span className="text-muted-foreground">{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {data && data.missingRequired.length > 0 ? (
        <p className="mt-3 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive">
          Ontbrekende verplichte variabelen: {data.missingRequired.join(", ")}
        </p>
      ) : null}
      {data && data.missingOptional.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Optioneel niet ingesteld: {data.missingOptional.join(", ")}
        </p>
      ) : null}
      {login.data ? (
        <div className="mt-4 space-y-2 text-xs">
          <h4 className="font-semibold">Login-providers (basis: {login.data.baseUrl})</h4>
          <p className={login.data.coreReady ? "text-muted-foreground" : "text-destructive"}>
            {Object.entries(login.data.core)
              .map(([k, ok]) => `${k}: ${ok ? "ok" : "ONTBREEKT"}`)
              .join(" · ")}
          </p>
          <ul className="space-y-1.5">
            {login.data.providers.map((p) => (
              <li key={p.id} className="rounded-xl border border-border/60 p-2">
                <span className="font-medium capitalize">{p.id}</span>{" "}
                {p.configured ? "✓ ingesteld" : `✗ ontbreekt: ${p.missing.join(", ")}`}
                <span className="block break-all font-mono text-[11px] text-muted-foreground">
                  Callback: {p.callbackUrl}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
