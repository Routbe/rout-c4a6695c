import { getMySnapchat, updateMySnapchat } from "@/lib/snapchat.functions";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, Search } from "lucide-react";
import { BrandIcon } from "@/components/integrations/BrandIcon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INTEGRATIONS, integrationById, type Integration, type IntegrationCategory } from "@/lib/integrations-catalog";
import { getMyIntegrations, saveIntegration } from "@/lib/integrations.functions";
import { getMyPresence, setSpotifyPresenceVisible } from "@/lib/presence.functions";
import { IntegrationVault } from "./IntegrationVault";
import { i18n as trI18n } from "@/lib/i18n";

const SUGGESTED = ["spotify", "github", "youtube", "bluesky", "wsocial", "lichess", "chesscom", "wakatime"];

const TABS: { id: "suggested" | "all" | IntegrationCategory; label: string }[] = [
  { id: "suggested", label: "⭐ Aanbevolen" },
  { id: "all", label: "Alles" },
  { id: "music", label: "Muziek" },
  { id: "gaming", label: "Gaming" },
  { id: "streaming", label: "Streaming" },
  { id: "socials", label: "Socials" },
  { id: "work", label: "Werk & Code" },
  { id: "culture", label: "Cultuur & Vrije Tijd" },
  { id: "home", label: "Smart Home" },
  { id: "payments", label: "Support & Betalingen" },
];

type TabId = (typeof TABS)[number]["id"];

/** Popup om een live dienst aan je profiel toe te voegen: zoeken, tabbladen en koppelen in één venster. */
export function AddLiveIntegrationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("suggested");
  const [query, setQuery] = useState("");
  const [connect, setConnect] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const fetchPresence = useServerFn(getMyPresence);
  const fetchMine = useServerFn(getMyIntegrations);
  const fetchSnap = useServerFn(getMySnapchat);
  const showSnap = useServerFn(updateMySnapchat);
  const snapQuery = useQuery({ queryKey: ["my-snapchat"], queryFn: () => fetchSnap(), retry: false, enabled: open });
  const snap = snapQuery.data?.snap;
  const save = useServerFn(saveIntegration);
  const showSpotify = useServerFn(setSpotifyPresenceVisible);
  const presence = useQuery({ queryKey: ["my-presence"], queryFn: () => fetchPresence(), retry: false, enabled: open });
  const mine = useQuery({ queryKey: ["my-integrations"], queryFn: () => fetchMine(), retry: false, enabled: open });
  const spotify = presence.data?.connections.find((c) => c.provider === "spotify");
  const rows = mine.data?.ready ? mine.data.items : [];
  const rowFor = (p: string) => rows.find((r) => r.provider === p);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return INTEGRATIONS.filter((i) => i.label.toLowerCase().includes(q) || i.id.includes(q));
    if (tab === "all") return INTEGRATIONS;
    if (tab === "suggested") return SUGGESTED.map((id) => integrationById(id)).filter((i): i is Integration => Boolean(i));
    return INTEGRATIONS.filter((i) => i.category === tab);
  }, [tab, query]);

  const close = () => {
    setConnect(null);
    setQuery("");
    onClose();
  };

  const activate = async (item: Integration) => {
    setBusy(item.id);
    try {
      if (item.id === "snapchat") {
        if (!snap) { setConnect(item.id); return; }
        await showSnap({ data: { showCard: true } });
        await qc.invalidateQueries({ queryKey: ["my-snapchat"] });
      } else if (item.id === "spotify") {
        await showSpotify({ data: { show: true } });
        await qc.invalidateQueries({ queryKey: ["my-presence"] });
      } else {
        const row = rowFor(item.id);
        if (!row) return;
        const r = await save({ data: { provider: item.id, handle: row.handle, audience: row.audience, visible: true, useSso: row.verified } });
        if (!r.ok) throw new Error();
        await qc.invalidateQueries({ queryKey: ["my-integrations"] });
      }
      toast.success(`${item.label} staat op je profiel`);
      close();
    } catch {
      toast.error(trI18n.t("ui.a7e9d75b1d"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 overflow-hidden p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle className="truncate">{connect ? `${integrationById(connect)?.label ?? ""} koppelen` : "Live integratie toevoegen"}</DialogTitle>
        </DialogHeader>
        {connect ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <button type="button" onClick={() => setConnect(null)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Terug naar het overzicht
            </button>
            <IntegrationVault focus={connect} />
          </div>
        ) : (
          <>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek een dienst, bv. spo, git, ches…"
                aria-label="Zoek een dienst"
                className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {!query && (
              <div role="tablist" aria-label="Categorieën" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tab === t.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Geen diensten gevonden.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {list.map((item) => {
                    const soon = item.mode === "soon";
                    const row = rowFor(item.id);
                    const linked = item.id === "snapchat" ? Boolean(snap) : item.id === "spotify" ? Boolean(spotify) : Boolean(row);
                    const account = item.id === "snapchat" ? snap?.displayName ?? "Snapchat" : item.id === "spotify" ? spotify?.accountName ?? "account" : row ? `@${row.handle.replace(/^@/, "")}` : "";
                    return (
                      <div key={item.id} className={`flex items-center gap-2.5 rounded-xl border border-border bg-background p-3 ${soon ? "opacity-60" : ""}`}>
                        <BrandIcon icon={item.icon} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-sm font-medium">
                            {item.label}
                            {row?.verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Geverifieerd" />}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {soon ? "Binnenkort" : linked ? `Gekoppeld · ${account}` : "Nog niet gekoppeld"}
                          </span>
                        </span>
                        {!soon && (
                          <button
                            type="button"
                            disabled={busy === item.id}
                            onClick={() => (linked ? void activate(item) : setConnect(item.id))}
                            className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            {linked ? "Activeer op profiel" : "Koppelen"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
