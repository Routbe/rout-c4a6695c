import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminOverview } from "@/lib/admin.functions";
import { euro } from "@/lib/profile";
import { i18n as trI18n } from "@/lib/i18n";

interface Overview {
  verifiedUsers: number;
  totalUsers: number;
  revenueCents: number;
  paymentsCount: number;
  activeDomains: number;
  webhooks: {
    id: string;
    source: string;
    kind: string | null;
    status: string;
    createdAt: string;
  }[];
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Minimalistisch operationeel overzicht bovenaan de admin-console. */
export function AdminOverviewPanel() {
  const load = useServerFn(adminOverview);
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = (await load()) as Overview;
        if (active) setData(res);
      } catch {
        toast.error(trI18n.t("ui.6bebedaf8f"));
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  if (!data) return null;

  return (
    <section className="mb-6 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Geverifieerde leden"
          value={String(data.verifiedUsers)}
          hint={`van ${data.totalUsers} profielen`}
        />
        <Metric
          label="Omzet (Stripe)"
          value={euro(data.revenueCents)}
          hint={`${data.paymentsCount} betalingen`}
        />
        <Metric label="Actieve domeinen" value={String(data.activeDomains)} />
        <Metric label="Webhooks (recent)" value={String(data.webhooks.length)} />
      </div>

      {data.webhooks.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Laatste webhooks</h3>
          <ul className="divide-y divide-border text-xs">
            {data.webhooks.map((event) => (
              <li key={event.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  {event.source} · {event.kind ?? "—"}
                </span>
                <span
                  className={
                    event.status === "processed" || event.status === "ok"
                      ? "text-primary"
                      : "text-destructive"
                  }
                >
                  {event.status}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
