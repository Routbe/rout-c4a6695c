import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AtSign, Lock, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSearchHandles } from "@/lib/admin-platform.functions";

export const Route = createFileRoute("/_authenticated/admin/handles")({
  head: () => ({
    meta: [
      { title: "Gebruikersnamen | ROUT beheer" },
      { name: "description", content: "Zoek wie een naam bezit in elke ruimte: rootnaam, alias, domeinclaim, werkruimte of goedgekeurde naam." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Gebruikersnamen | ROUT beheer" },
      { property: "og:description", content: "Zoek wie een naam bezit in elke ruimte: rootnaam, alias, domeinclaim, werkruimte of goedgekeurde naam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HandlesPage,
});

type Result = Awaited<ReturnType<typeof adminSearchHandles>>;

const KIND_LABEL: Record<Result["rows"][number]["kind"], string> = {
  root: "Rootnaam (rout.be/…)",
  alias: "Alias (rout.be/u/…)",
  domain_claim: "Domeinclaim",
  workspace: "Werkruimte (/w/…)",
  approved: "Goedgekeurde naam",
};

function HandlesPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => {
      adminSearchHandles({ data: { query: q } })
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch(() => setError("Je hebt geen recht om namen te bekijken."));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <AppLayout
      title="Gebruikersnamen"
      description="Eén register voor alle namen. Een naam wijzigen of toewijzen doe je bij het lid (Leden 360° of de console); merknamen vrijgeven bij Merknamen."
      crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Gebruikersnamen" }]}
      width="wide"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input className="pl-8" placeholder="Zoek een naam (min. 2 tekens)…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/admin/brands">Merknamen</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/console" search={{ tab: "vip" }}>VIP-handles</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/console" search={{ tab: "network" }}>Aliassen</Link></Button>
          </div>
          {result?.reserved && (
            <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <Lock className="h-4 w-4" aria-hidden /> “{query.trim().replace(/^@+/, "").toLowerCase()}” is gereserveerd (systeemroute of merknaam) en kan niet vrij geclaimd worden.
            </p>
          )}
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {!result && <p className="p-4 text-sm text-muted-foreground">Typ een naam om te zoeken.</p>}
            {result && result.rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Niemand gebruikt deze naam.</p>}
            {result?.rows.map((r, i) => (
              <div key={`${r.kind}-${r.handle}-${i}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <AtSign className="h-4 w-4 text-muted-foreground" aria-hidden /> {r.handle}
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{KIND_LABEL[r.kind]}</span>
                    {r.status && <span className="text-[11px] text-muted-foreground">{r.status}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{[r.label, r.email].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {r.email && (
                  <Button asChild size="sm" variant="outline"><Link to="/admin/members" search={{ q: r.email }}>Open lid</Link></Button>
                )}
                {r.kind === "workspace" && (
                  <Button asChild size="sm" variant="outline"><Link to="/admin/workspaces">Werkruimtes</Link></Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
