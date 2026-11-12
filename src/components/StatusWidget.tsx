import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type State = "checking" | "operational" | "degraded" | "down";

const dotClass: Record<State, string> = {
  checking: "bg-muted-foreground animate-pulse",
  operational: "bg-emerald-500 animate-pulse",
  degraded: "bg-amber-500",
  down: "bg-destructive",
};

/** Live availability indicator backed by /api/public/health. */
export function StatusWidget({ className }: { className?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>("checking");
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/public/health", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as { status?: string; latency_ms?: number };
        if (cancelled) return;
        setState(data.status === "operational" ? "operational" : "degraded");
        setLatency(typeof data.latency_ms === "number" ? data.latency_ms : null);
      } catch {
        if (!cancelled) {
          setState("down");
          setLatency(null);
        }
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const label = t(`status.${state}`);

  return (
    <p
      className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}
      aria-live="polite"
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass[state])} aria-hidden="true" />
      <span>{label}</span>
      {latency !== null && state !== "checking" && (
        <span className="text-muted-foreground">· {latency} ms</span>
      )}
    </p>
  );
}
