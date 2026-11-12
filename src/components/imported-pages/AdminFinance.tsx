import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ControlHeader, ControlMetric, ControlTable, ControlError } from "@/components/admin/ControlCenterUI";
import { financeQuery } from "@/lib/admin-control.queries";

export default function AdminFinance() {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const { data, refetch, isFetching, isRefetchError } = useSuspenseQuery(financeQuery(search, cursors.at(-1) ?? null));
  return <AppLayout width="wide"><ControlHeader title="Financieel & SEPA" subtitle="Rekeninghouders, geverifieerde identiteit en openstaande reviews." refreshing={isFetching} refresh={() => void refetch()} />
    <ControlError error={isRefetchError} />
    <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-3"><ControlMetric label="Ingestelde IBAN’s" value={data.total} /><ControlMetric label="Actieve Tip Jars" value={data.enabled} /><ControlMetric label="Open SEPA reviews" value={data.openReviews} /></div>
    <section className="mb-10"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">IBAN-register</h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(draft); setCursors([null]); }}><Input aria-label="Zoek rekeninghouder of IBAN" placeholder="Naam, handle of IBAN" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} /><Button variant="outline" size="icon" aria-label="Zoeken"><Search /></Button></form></div>
      <ControlTable headers={["Lid", "IBAN", "Tenaamstelling", "Geverifieerde identiteit", "Controle", "Tip Jar"]} empty={!data.accounts.length}>
        {data.accounts.map((a) => <tr key={a.userId}><td className="px-3 py-4"><span className="block font-medium">{a.name ?? "—"}</span><span className="text-xs text-muted-foreground">{a.username ? `@${a.username}` : "Geen handle"}</span></td><td className="whitespace-nowrap px-3 py-4 font-mono text-xs">{a.iban}</td><td className="px-3 py-4">{a.holder ?? "—"}</td><td className="px-3 py-4">{a.verifiedName ?? "Niet beschikbaar"}</td><td className="px-3 py-4"><span className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${a.identityStatus === "match" ? "text-accent" : "text-destructive"}`}>{a.identityStatus === "match" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{a.identityStatus === "match" ? "Exacte match" : a.identityStatus === "mismatch" ? "Naam wijkt af" : "Identiteit ontbreekt"}</span></td><td className="px-3 py-4 text-xs">{a.enabled ? "Actief" : "Uitgeschakeld"}</td></tr>)}
      </ControlTable><div className="mt-3 flex items-center justify-between"><p className="text-xs text-muted-foreground">Pagina {cursors.length} · {data.accounts.length} resultaten</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}>Vorige</Button><Button size="sm" variant="outline" disabled={!data.nextCursor} onClick={() => setCursors((c) => [...c, data.nextCursor])}>Volgende</Button></div></div>
    </section>
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">SEPA Review Queue</h2><Button variant="outline" size="sm" asChild><Link to="/admin/sepa">Reviews behandelen ({data.openReviews})</Link></Button></div>
      <ControlTable headers={["Lid / referentie", "Naam betaler", "Verwachte rekeninghouder", "Signaal"]} empty={!data.reviews.length}>{data.reviews.map((r) => <tr key={r.id}><td className="px-3 py-3">{r.name ?? "—"}<span className="block text-xs text-muted-foreground">{r.reference}</span></td><td className="px-3 py-3">{r.payer ?? "—"}</td><td className="px-3 py-3">{r.holder ?? "—"}</td><td className="px-3 py-3 text-xs text-warning">{r.reason}</td></tr>)}</ControlTable>
    </section><div className="mt-6 flex flex-wrap gap-4 text-sm"><Link to="/admin/gift-cards" className="underline">Cadeaubonnen beheren</Link><Link to="/admin/members" className="underline">Leden 360°</Link></div>
  </AppLayout>;
}