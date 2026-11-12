import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ControlHeader({ title, subtitle, refreshing, refresh }: { title: string; subtitle: string; refreshing: boolean; refresh: () => void }) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
    <div><p className="mb-2 text-xs font-medium uppercase text-muted-foreground">ROUT / Ops Center</p>
      <h1 className="text-3xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{subtitle}</p></div>
    <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh}><RefreshCw className={refreshing ? "animate-spin" : ""} aria-hidden /> Vernieuwen</Button>
  </header>;
}
export function ControlMetric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <div className="border-l-2 border-border pl-4"><p className="text-xs text-muted-foreground">{label}</p>
    <p className="my-2 text-4xl font-semibold tabular-nums">{value.toLocaleString("nl-BE")}</p>{detail && <p className="text-xs text-muted-foreground">{detail}</p>}</div>;
}
export function ControlTable({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: boolean }) {
  return <div className="overflow-x-auto border-y border-border"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{empty ? <tr><td colSpan={headers.length} className="py-10 text-center text-muted-foreground">Geen resultaten.</td></tr> : children}</tbody></table></div>;
}
export function ControlError({ error }: { error: boolean }) { return error ? <p role="alert" className="my-4 text-sm text-destructive">Gegevens konden niet worden geladen. Vernieuw om opnieuw te proberen.</p> : null; }