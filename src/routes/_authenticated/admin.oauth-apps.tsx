import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { adminActOnOAuthApp, adminListOAuthApps } from "@/lib/admin-members.functions";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/oauth-apps")({
  head: () => ({
    meta: [
      { title: "OAuth-applicaties | ROUT beheer" },
      { name: "description", content: "Beoordeel, blokkeer en deblokkeer apps die met ROUT laten inloggen." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "OAuth-applicaties | ROUT beheer" },
      { property: "og:description", content: "Beoordeel, blokkeer en deblokkeer apps die met ROUT laten inloggen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthAppsPage,
});

type App = Awaited<ReturnType<typeof adminListOAuthApps>>[number];
type Action = "approve" | "reject" | "block" | "unblock";
const FOLDERS = [
  { id: "pending", label: "Ter beoordeling" },
  { id: "verified", label: "Goedgekeurd" },
  { id: "rejected", label: "Afgewezen" },
  { id: "blocked", label: "Geblokkeerd" },
] as const;
type Folder = (typeof FOLDERS)[number]["id"];

function folderOf(app: App): Folder {
  if (app.blocked) return "blocked";
  if (app.review === "pending") return "pending";
  if (app.review === "rejected") return "rejected";
  // Active apps without a verification request are not new requests.
  return "verified";
}

const REVIEW: Record<string, string> = { pending: "Ter beoordeling", verified: "Goedgekeurd", rejected: "Afgewezen", none: "Geen aanvraag" };
const CONFIRM: Record<Action, string> = {
  approve: "Deze app goedkeuren?",
  reject: "Deze aanvraag afwijzen?",
  block: "App blokkeren? Niemand kan er dan nog mee inloggen.",
  unblock: "App weer activeren?",
};

function OAuthAppsPage() {
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [folder, setFolder] = useState<Folder>("pending");

  const load = useCallback(async () => {
    try {
      setApps(await adminListOAuthApps());
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function act(id: string, action: Action) {
    if (!window.confirm(CONFIRM[action])) return;
    setBusy(id);
    try {
      await adminActOnOAuthApp({ data: { id, action } });
      notifySuccess("Opgeslagen");
      await load();
    } catch {
      notifyError("Actie mislukt");
    } finally {
      setBusy(null);
    }
  }

  const f = filter.toLowerCase();
  const counts = Object.fromEntries(FOLDERS.map(({ id }) => [id, (apps ?? []).filter((a) => folderOf(a) === id).length]));
  const list = (apps ?? []).filter((a) => folderOf(a) === folder && (!f || a.name.toLowerCase().includes(f) || a.clientId.toLowerCase().includes(f) || (a.owner ?? "").toLowerCase().includes(f)));

  return (
    <AppLayout
      title="OAuth-applicaties"
      description="Apps die 'Inloggen met ROUT' gebruiken. Blokkeren trekt openstaande inlogcodes meteen in."
      crumbs={[{ label: "Beheer", to: "/admin" }, { label: "OAuth-apps" }]}
      width="wide"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">Je hebt geen recht om apps te beheren.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Aanvraagstatus" className="mb-4 flex flex-wrap gap-2">
            {FOLDERS.map(({ id, label }) => (
              <Button key={id} role="tab" aria-selected={folder === id} aria-controls="oauth-apps-panel" id={`oauth-apps-tab-${id}`} size="sm" variant={folder === id ? "default" : "outline"} onClick={() => setFolder(id)}>
                {label} ({apps ? counts[id] : "…"})
              </Button>
            ))}
          </div>
          <Input placeholder="Zoek op naam, client ID of eigenaar…" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-4 max-w-sm" />
          <div id="oauth-apps-panel" role="tabpanel" aria-labelledby={`oauth-apps-tab-${folder}`} className="space-y-3">
            {!apps && <p className="text-sm text-muted-foreground">Laden…</p>}
            {apps && list.length === 0 && <p className="text-sm text-muted-foreground">Geen apps gevonden.</p>}
            {list.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.name || "Naamloze app"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{a.clientId}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Eigenaar: {a.owner ? `@${a.owner.replace(/^@/, "")}` : "onbekend"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={a.review === "verified" ? "default" : a.review === "rejected" ? "destructive" : "secondary"}>{REVIEW[a.review] ?? a.review}</Badge>
                    <Badge variant={a.blocked ? "destructive" : "outline"}>{a.blocked ? "Geblokkeerd" : "Actief"}</Badge>
                  </div>
                </div>
                {a.redirectUris.length > 0 && (
                  <ul className="mt-3 space-y-0.5 font-mono text-xs text-muted-foreground">
                    {a.redirectUris.map((u) => <li key={u} className="truncate">{u}</li>)}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy === a.id || a.review === "verified"} onClick={() => act(a.id, "approve")}>Goedkeuren</Button>
                  <Button size="sm" variant="outline" disabled={busy === a.id || a.review === "rejected"} onClick={() => act(a.id, "reject")}>Afwijzen</Button>
                  {a.blocked ? (
                    <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => act(a.id, "unblock")}>Deblokkeren</Button>
                  ) : (
                    <Button size="sm" variant="destructive" disabled={busy === a.id} onClick={() => act(a.id, "block")}>Blokkeren</Button>
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
