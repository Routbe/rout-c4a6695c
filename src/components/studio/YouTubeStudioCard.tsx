import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { YouTubeCardView } from "@/components/profile/YouTubeCard";
import { disconnectYouTubeVault, getMyYouTube, setYouTubeCardVisible } from "@/lib/youtube.functions";
import { i18n as trI18n } from "@/lib/i18n";

const previewTheme = {
  card: "var(--card)",
  border: "var(--border)",
  text: "var(--foreground)",
  muted: "var(--muted-foreground)",
};

/** Studio: link YouTube in the vault, preview the card, toggle it, or disconnect. */
export function YouTubeStudioCard() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyYouTube);
  const setVisible = useServerFn(setYouTubeCardVisible);
  const disconnect = useServerFn(disconnectYouTubeVault);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["my-youtube"], queryFn: () => fetchMine() });
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-youtube"] });

  return (
    <section id="studio-youtube" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">YouTube Kaart</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Toon je kanaal, abonnees en je 3 nieuwste video's op je profiel. Alleen-lezen toegang.
          </p>
        </div>
        {d?.connected && (
          <Switch
            aria-label="YouTube Kaart tonen op je profiel"
            checked={d.visible}
            disabled={busy}
            onCheckedChange={async (v) => {
              setBusy(true);
              try {
                await setVisible({ data: { visible: v } });
                await refresh();
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : d?.connected ? (
        <>
          {d.card ? (
            <YouTubeCardView card={d.card} theme={previewTheme} />
          ) : (
            <p className="text-sm text-muted-foreground">Gekoppeld — je kanaalgegevens worden opgehaald.</p>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await disconnect();
                toast.success(trI18n.t("ui.dc2c0a43d8"));
                await refresh();
              } catch {
                toast.error(trI18n.t("ui.f9b98397eb"));
              } finally {
                setBusy(false);
              }
            }}
          >
            Ontkoppelen
          </Button>
        </>
      ) : (
        <>
          {d?.status === "disconnected" && (
            <p className="text-sm text-destructive">De koppeling is verlopen. Koppel YouTube opnieuw.</p>
          )}
          {d && !d.ready ? (
            <p className="text-sm text-muted-foreground">YouTube is nog niet ingesteld op ROUT.</p>
          ) : (
            <Button asChild size="sm">
              <a href="/api/youtube/start">Koppel YouTube</a>
            </Button>
          )}
          {d?.status === "disconnected" && (
            <Button variant="ghost" size="sm" onClick={async () => { await disconnect(); await refresh(); }}>
              Verwijderen
            </Button>
          )}
        </>
      )}
    </section>
  );
}
