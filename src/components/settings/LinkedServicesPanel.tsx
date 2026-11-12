import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAllMyLinkedServices } from "@/lib/dashboard-widgets.functions";

/** One overview of every service linked to the ROUT profile, wherever it was connected. */
export function LinkedServicesPanel() {
  const load = useServerFn(getAllMyLinkedServices);
  const q = useQuery({ queryKey: ["linked-services"], queryFn: () => load(), staleTime: 30_000 });
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium"><Link2 className="h-4 w-4" aria-hidden /> Gekoppelde diensten</h2>
      <p className="text-sm text-muted-foreground">Alles wat je koppelt in de Profiel Studio, het Command Center of je hub hangt aan je ROUT-profiel en staat hier.</p>
      {q.isPending ? <p className="text-sm text-muted-foreground">Laden…</p> : !q.data?.length ? <p className="text-sm text-muted-foreground">Nog niets gekoppeld.</p> : (
        <ul className="divide-y divide-border">
          {q.data.map((s) => (
            <li key={s.provider} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm font-medium capitalize">{s.provider}</span>
              <span className="flex items-center gap-2">
                {s.publicOnProfile ? <Badge variant="secondary">Op profiel</Badge> : <Badge variant="outline">Privé</Badge>}
                <Badge variant={s.status === "connected" ? "default" : "destructive"}>{s.status === "connected" ? "Actief" : "Opnieuw koppelen"}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="outline" size="sm"><a href="/studio">Beheren in Profiel Studio</a></Button>
    </section>
  );
}
