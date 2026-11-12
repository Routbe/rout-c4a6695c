import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { disconnectMySnapchat, getMySnapchat, setBitmojiAvatar, updateMySnapchat } from "@/lib/snapchat.functions";
import { i18n as trI18n } from "@/lib/i18n";

const MOODS = ["🚗", "💻", "☕", "🎧", "🏋️", "✈️", "😴", "🎉"];
const FLAGS: Record<string, string> = {
  connected: "Snapchat gekoppeld",
  cancelled: "Koppelen geannuleerd",
  not_configured: "Snapchat is nog niet ingesteld op ROUT",
  invalid_state: "Sessie verlopen, probeer opnieuw",
  in_use: "Dit Snapchat-account is al aan een ander profiel gekoppeld",
  failed: "Koppelen mislukt",
};

/** Snapchat: Snap Kit koppeling, Bitmoji als profielfoto, kaart en handmatige status. */
export function useSnapchatCallback() {
  const qc = useQueryClient();
  useEffect(() => {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("snapchat");
    if (!flag) return;
    (flag === "connected" ? toast.success : toast.error)(FLAGS[flag] ?? "Koppelen mislukt");
    void qc.invalidateQueries({ queryKey: ["my-snapchat"] });
    url.searchParams.delete("snapchat");
    window.history.replaceState(null, "", url.toString());
  }, [qc]);
}

export function SnapchatPanel() {
  useSnapchatCallback();
  const qc = useQueryClient();
  const fetchSnap = useServerFn(getMySnapchat);
  const update = useServerFn(updateMySnapchat);
  const setAvatar = useServerFn(setBitmojiAvatar);
  const disconnect = useServerFn(disconnectMySnapchat);
  const q = useQuery({ queryKey: ["my-snapchat"], queryFn: () => fetchSnap() });
  const snap = q.data?.snap;
  const [emoji, setEmoji] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    setEmoji(snap?.moodEmoji ?? "");
    setText(snap?.moodText ?? "");
  }, [snap?.moodEmoji, snap?.moodText]);



  const save = async (p: { moodEmoji?: string | null; moodText?: string | null; showCard?: boolean; showMood?: boolean }) => {
    await update({ data: p });
    await qc.invalidateQueries({ queryKey: ["my-snapchat"] });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">👻 Snapchat &amp; Bitmoji</p>
          <p className="text-xs text-muted-foreground">Geen locatie of kaart — alleen je naam, Bitmoji en een status die jij kiest.</p>
        </div>
        {snap ? (
          <Button variant="outline" size="sm" onClick={async () => { await disconnect(); await qc.invalidateQueries({ queryKey: ["my-snapchat"] }); }}>
            Ontkoppelen
          </Button>
        ) : (
          <Button size="sm" onClick={() => {
            if (q.data && !q.data.ready) return void toast.error(FLAGS["not_configured"] ?? "Snapchat niet ingesteld");
            window.location.href = "/api/snapchat/start";
          }}>
            Koppel Snapchat
          </Button>
        )}
      </div>

      {snap && (
        <>
          <div className="flex items-center gap-3">
            {snap.bitmojiUrl ? (
              <img src={snap.bitmojiUrl} alt="Je Bitmoji" className="h-16 w-16 rounded-full border border-border bg-muted object-contain" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-full bg-muted text-2xl">👻</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{snap.displayName ?? "Snapchat"}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-1"
                disabled={!snap.bitmojiUrl}
                onClick={async () => {
                  const r = await setAvatar();
                  r.ok ? toast.success(trI18n.t("ui.2d440b3b0a")) : toast.error(trI18n.t("ui.d3f0da91f2"));
                }}
              >
                Gebruik als profielfoto
              </Button>
            </div>
          </div>

          <label className="flex items-center justify-between text-sm">
            Snapchat-kaart op mijn profiel
            <Switch checked={snap.showCard} onCheckedChange={(v) => void save({ showCard: v })} />
          </label>

          <div className="space-y-2">
            <label className="flex items-center justify-between text-sm">
              Status/mood tonen
              <Switch checked={snap.showMood} onCheckedChange={(v) => void save({ showMood: v })} />
            </label>
            <div className="flex flex-wrap gap-1">
              {MOODS.map((m) => (
                <button key={m} type="button" onClick={() => setEmoji(m)}
                  className={`h-8 w-8 rounded-full border text-base ${emoji === m ? "border-primary bg-primary/10" : "border-border"}`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input aria-label="Snapchat-status" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="Bijv. Onderweg" />
              <Button size="sm" onClick={async () => { await save({ moodEmoji: emoji, moodText: text }); toast.success(trI18n.t("ui.ff50632acd")); }}>
                Opslaan
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
