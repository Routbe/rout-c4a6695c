import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminActOnWorkspace, adminListWorkspaces } from "@/lib/admin-platform.functions";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/workspaces")({
  head: () => ({
    meta: [
      { title: "Werkruimtes & bedrijven | ROUT beheer" },
      { name: "description", content: "Overzicht van alle werkruimtes: eigenaars, leden, domeinverificatie en zichtbaarheid." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Werkruimtes & bedrijven | ROUT beheer" },
      { property: "og:description", content: "Overzicht van alle werkruimtes: eigenaars, leden, domeinverificatie en zichtbaarheid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspacesPage,
});

type Row = Awaited<ReturnType<typeof adminListWorkspaces>>[number];
type Action = "hide" | "show" | "revoke_domain";

function WorkspacesPage() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await adminListWorkspaces({ data: { search, limit: 200 } }));
    } catch {
      setDenied(true);
    }
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (row: Row, action: Action) => {
    if (action === "revoke_domain" && !window.confirm(`Domeinverificatie van ${row.domain} intrekken? De werkruimte moet het domein opnieuw via DNS bewijzen.`)) return;
    setBusy(row.id);
    try {
      await adminActOnWorkspace({ data: { workspaceId: row.id, action } });
      notifySuccess("Werkruimte bijgewerkt.");
      await load();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Actie mislukt.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppLayout
      title="Werkruimtes & bedrijven"
      description="Bedrijfsverificaties keur je goed onder Verificaties & aanvragen; hier beheer je de werkruimtes zelf."
      crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Werkruimtes" }]}
      width="wide"
    >
      {denied ? (
        <p className="text-sm text-muted-foreground">Je hebt geen recht om werkruimtes te bekijken.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input className="pl-8" placeholder="Zoek op naam, slug of domein…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/admin/verifications">Verificatieaanvragen</Link></Button>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {!rows && <p className="p-4 text-sm text-muted-foreground">Laden…</p>}
            {rows && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Geen werkruimtes gevonden.</p>}
            {rows?.map((w) => (
              <div key={w.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden /> {w.name}
                    {w.slug && <span className="font-mono text-xs text-muted-foreground">/w/{w.slug}</span>}
                    {w.plan && <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{w.plan}</span>}
                    {!w.publicProfile && <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive">Verborgen</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.members} {w.members === 1 ? "lid" : "leden"} · eigenaar: {w.owners.length ? w.owners.join(", ") : "—"}
                    {w.category ? ` · ${w.category}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Domein: {w.domain ? `${w.domain} ${w.domainVerifiedAt ? "(geverifieerd)" : "(niet geverifieerd)"}` : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {w.slug && w.publicProfile && (
                    <Button asChild size="sm" variant="ghost"><a href={`/w/${w.slug}`} target="_blank" rel="noopener noreferrer">Bekijk</a></Button>
                  )}
                  {w.owners[0] && (
                    <Button asChild size="sm" variant="outline"><Link to="/admin/members" search={{ q: w.owners[0] }}>Eigenaar</Link></Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy === w.id} onClick={() => void act(w, w.publicProfile ? "hide" : "show")}>
                    {w.publicProfile ? "Verbergen" : "Zichtbaar maken"}
                  </Button>
                  {w.domainVerifiedAt && (
                    <Button size="sm" variant="outline" disabled={busy === w.id} onClick={() => void act(w, "revoke_domain")}>Domein intrekken</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
