import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ControlHeader, ControlTable, ControlError } from "@/components/admin/ControlCenterUI";
import { infraQuery, type InfraStatus } from "@/lib/admin-control.queries";
import { webhookHealth } from "@/lib/admin-control-rules";

type Kind = "webhooks" | "subdomains" | "aliases";
export default function AdminInfrastructure() {
  const [kind, setKind] = useState<Kind>("webhooks");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InfraStatus>("all");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const { data, refetch, isFetching, isRefetchError } = useSuspenseQuery(infraQuery(kind, search, status, cursors.at(-1) ?? null));
  const changeKind = (v: string) => { if (v !== "webhooks" && v !== "subdomains" && v !== "aliases") return; setKind(v); setStatus("all"); setSearch(""); setDraft(""); setCursors([null]); };
  const headers = kind === "webhooks" ? ["Ontvangen", "Bron / event", "Richting", "HTTP", "Verwerking", "Pogingen", "Resultaat / fout"] : kind === "subdomains" ? ["Lid", "Subdomein", "Namespace", "Status"] : ["Alias", "Lid", "Bestemming", "Status", "Bijgewerkt"];
  return <AppLayout width="wide"><ControlHeader title="Infrastructuur & Logs" subtitle="Webhookverwerking, geclaimde subdomeinen en e-mailaliassen." refreshing={isFetching} refresh={() => void refetch()} />
    <ControlError error={isRefetchError} />
    <Tabs value={kind} onValueChange={changeKind}><TabsList className="mb-6"><TabsTrigger value="webhooks">Webhooks</TabsTrigger><TabsTrigger value="subdomains">Subdomeinen</TabsTrigger><TabsTrigger value="aliases">E-mailaliassen</TabsTrigger></TabsList></Tabs>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(draft); setCursors([null]); }}><Input aria-label="Zoeken in infrastructuur" placeholder="Zoeken…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} /><Button variant="outline" size="icon" aria-label="Zoeken"><Search /></Button></form>
      {kind !== "subdomains" && <select aria-label="Statusfilter" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as InfraStatus); setCursors([null]); }}><option value="all">Alle statussen</option>{(kind === "webhooks" ? ["failed", "done", "success", "processing"] : ["active", "pending", "failed", "paused"]).map((s) => <option key={s} value={s}>{s}</option>)}</select>}
    </div>
    <ControlTable headers={headers} empty={!data.items.length}>{data.items.map((r) => <tr key={r["id"]}>
      {kind === "webhooks" ? <><td className="whitespace-nowrap px-3 py-3 text-xs">{new Date(r["created_at_iso"] ?? "").toLocaleString("nl-BE")}</td><td className="px-3 py-3"><span className="block font-medium">{r["source"]}</span><span className="text-xs text-muted-foreground">{r["kind"] ?? r["id"]}</span></td><td className="px-3 py-3 text-xs">{r["direction"] ?? "Niet geregistreerd"}</td><td className="px-3 py-3 font-mono text-xs">{r["http_status"] ?? "—"}</td><td className={`px-3 py-3 text-xs ${webhookHealth(r["status"] ?? "") === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{r["status"]}</td><td className="px-3 py-3 tabular-nums">{r["attempts"]}</td><td className="max-w-sm break-words px-3 py-3 text-xs"><details><summary className="cursor-pointer">Details</summary><p className="mt-2 whitespace-pre-wrap">{r["error"] ?? r["result"] ?? "Geen aanvullende gegevens"}</p></details></td></> : kind === "subdomains" ? <><td className="px-3 py-3">{r["username"] ? `@${r["username"]}` : r["display_name"]}</td><td className="px-3 py-3 font-mono text-xs">{r["subdomain_alias"]}{r["subdomain_tier"] === "free" ? ".u.rout.be" : r["subdomain_tier"] === "pro" ? ".r.rout.be" : ".rout.be"}</td><td className="px-3 py-3 text-xs">{r["subdomain_tier"]}</td><td className="px-3 py-3 text-xs">{r["subdomain_tier"] === "root_lifetime" ? r["root_subdomain_status"] : r["subdomain_enabled"] === "true" ? "Ingeschakeld" : "Uitgeschakeld"}</td></> : <><td className="px-3 py-3 font-mono text-xs">{r["alias"]}</td><td className="px-3 py-3">{r["username"] ? `@${r["username"]}` : "—"}</td><td className="px-3 py-3 text-xs">{r["target_email"]}</td><td className="px-3 py-3 text-xs">{r["status"]}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{new Date(r["updated_at_iso"] ?? "").toLocaleString("nl-BE")}</td></>}
    </tr>)}</ControlTable>
    <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Pagina {cursors.length} · Bijgewerkt {new Date(data.updatedAt).toLocaleTimeString("nl-BE")}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}>Vorige</Button><Button size="sm" variant="outline" disabled={!data.nextCursor} onClick={() => setCursors((c) => [...c, data.nextCursor])}>Volgende</Button></div></div>
    <div className="mt-8 flex flex-wrap gap-5 text-sm"><Link to="/admin/subdomains" className="underline">DNS-claims beheren</Link><Link to="/admin/ops" className="underline">Operations</Link></div>
  </AppLayout>;
}