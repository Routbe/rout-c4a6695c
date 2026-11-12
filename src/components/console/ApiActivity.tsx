import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ConsoleCard } from "@/components/console/ConsolePage";
import { listMyApiActivity } from "@/lib/oauth/console.functions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof listMyApiActivity>>[number];

/** Recent "Login met ROUT" calls of the developer's apps — real log rows, never sample data. */
export function ApiActivity() {
  const load = useServerFn(listMyApiActivity);
  const { data, isLoading, isError } = useQuery({ queryKey: ["console", "api-activity"], queryFn: () => load() });
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <ConsoleCard title="API-activiteit" description="Recente aanroepen naar je apps (laatste 7 dagen).">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Activiteit laden lukte niet.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">Nog geen activiteit. Zodra iemand inlogt via je app, verschijnt dat hier.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-2 pr-3 font-normal">Tijdstip</th><th className="py-2 pr-3 font-normal">Event</th><th className="py-2 pr-3 font-normal">App</th><th className="py-2 font-normal">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer hover:bg-muted/50">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs">{new Date(r.createdAt).toLocaleString("nl-BE")}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.endpoint}</td>
                  <td className="py-2 pr-3 text-xs">{r.appName}</td>
                  <td className="py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", r.outcome === "error" ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent")}>
                      {r.outcome === "error" ? r.errorCode ?? "fout" : "ok"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open?.endpoint} · {open?.outcome}</DialogTitle>
            <DialogDescription>Alleen technische gegevens; we bewaren geen tokens of persoonsgegevens.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs">
            {open ? JSON.stringify({ app: open.appName, errorCode: open.errorCode, ...open.detail, at: open.createdAt }, null, 2) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </ConsoleCard>
  );
}
