import { SpatialChoice } from "@/components/ui/spatial-choice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PRESENCE_DEFS } from "@/lib/avatar-decorations";
import { BUBBLE_FONTS, BUBBLE_STYLES, singleEmoji, type BubblePosition } from "@/lib/status-bubble";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";

type SetPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;
const pill = (on: boolean) =>
  cn("h-9 shrink-0 rounded-full border px-3 text-[11px] font-medium transition-colors", on ? "border-primary/50 bg-primary/10" : "border-border");

/** Links tab: what the status says (dot state + short text). */
export function StatusContentSettings({ prefs, setPref, bare = false, part }: { prefs: ProfileDisplayPrefs; setPref: SetPref; bare?: boolean; part?: "indicator" | "message" }) {
  const { t } = useI18n();
  const useEmoji = prefs.presenceIndicator === "emoji";
  return (
    <section className={bare ? "space-y-4" : "acrylic-card space-y-4 p-4 sm:p-5"}>
      <div className={bare ? "hidden" : undefined}>
        <h2 className="text-lg font-medium">{t("studio.status.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("studio.status.help")}</p>
      </div>
      {part !== "message" && <div className="space-y-2">
        <p className={part ? "sr-only" : "input-label"}>{t("studio.status.indicator")}</p>
        <SpatialChoice label={t("studio.status.indicator")} value={useEmoji ? "emoji" : prefs.presence} className="flex-wrap"
          onChange={(value) => { if (value === "emoji") setPref("presenceIndicator", "emoji"); else { const presence = PRESENCE_DEFS.find((p) => p.id === value); if (!presence) return; setPref("presence", presence.id); if (useEmoji) setPref("presenceIndicator", "color"); } }}
          options={[...PRESENCE_DEFS.map((p) => ({ value: p.id, title: t(`studio.presence.${p.id}.hint`), label: <><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ background: p.color }} />{t(`studio.presence.${p.id}`)}</> })), { value: "emoji", label: <><span aria-hidden>{prefs.presenceEmoji ?? "😎"}</span>{t("studio.status.custom")}</> }]} />
        {useEmoji ? (
          <div className="flex items-center gap-3 pt-1">
            <Input aria-label={t("studio.status.emoji")} inputMode="text" defaultValue={prefs.presenceEmoji ?? ""}
              onChange={(e) => { const ok = singleEmoji(e.target.value); if (ok || !e.target.value) setPref("presenceEmoji", ok); }}
              placeholder="😎" className="h-12 w-16 text-center text-2xl" />
            <p className="text-xs text-muted-foreground">{t("studio.status.emojiHelp")}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 pt-1">
            <div><p className="text-sm font-medium">{t("studio.status.icon")}</p><p className="text-xs text-muted-foreground">{t("studio.status.iconHelp")}</p></div>
            <Switch aria-label={t("studio.status.icon")} checked={prefs.presenceIndicator === "color_with_icon"} onCheckedChange={(on) => setPref("presenceIndicator", on ? "color_with_icon" : "color")} />
          </div>
        )}
      </div>}
      {part !== "indicator" && <div className="space-y-1.5">
        <p className={part ? "sr-only" : "input-label"}>{t("studio.status.message")}</p>
        <Input value={prefs.statusLine ?? ""} maxLength={60} onChange={(e) => setPref("statusLine", e.target.value || null)} placeholder={t("studio.status.placeholder")} className="h-10 text-xs" />
        <p className="text-xs text-muted-foreground">{t("studio.status.length", { count: (prefs.statusLine ?? "").length })}</p>
      </div>}
    </section>
  );
}

const COMPASS: (BubblePosition | null)[] = ["top-left", "top", "top-right", "left", null, "right", "bottom-left", "bottom", "bottom-right"];
const POS_LABEL: Record<BubblePosition, string> = {
  "top-left": "Linksboven", top: "Boven", "top-right": "Rechtsboven", left: "Links", right: "Rechts",
  "bottom-left": "Linksonder", bottom: "Onder", "bottom-right": "Rechtsonder",
};

/** Design tab: how the dot and the bubble look. */
export function StatusDesignSettings({ prefs, setPref, avatarUrl, theme }: {
  prefs: ProfileDisplayPrefs; setPref: SetPref; avatarUrl: string; theme: { bg: string; card: string; text: string; border: string; muted: string; accent?: string };
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-5 border-t border-border pt-4" data-avatar={avatarUrl ? "1" : "0"} data-theme={theme.bg}>
      <div className="space-y-2">
        <p className="input-label">{t("studio.status.position")}</p>
        <div className="grid w-36 grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("studio.status.positionLabel")}>
          {COMPASS.map((pos, i) =>
            pos ? (
              <Button variant="outline" key={pos} type="button" role="radio" aria-checked={prefs.statusBubblePosition === pos} aria-label={t(`studio.status.position.${pos}`)} title={t(`studio.status.position.${pos}`)}
                onClick={() => setPref("statusBubblePosition", pos)}
                className={cn("flex h-10 items-center justify-center rounded-lg border transition-colors", prefs.statusBubblePosition === pos ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
                <span className={cn("h-2 w-2 rounded-full", prefs.statusBubblePosition === pos ? "bg-primary" : "bg-muted-foreground/50")} />
              </Button>
            ) : (
              <span key={i} aria-hidden className="flex h-10 items-center justify-center rounded-full border border-dashed border-border text-[9px] text-muted-foreground">{t("studio.status.avatar")}</span>
            ),
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="input-label">{t("studio.status.style")}</p>
        <div className="flex flex-wrap gap-2">
          {BUBBLE_STYLES.map((s) => (
            <Button variant="outline" key={s.id} type="button" aria-pressed={prefs.statusBubbleStyle === s.id} onClick={() => setPref("statusBubbleStyle", s.id)}
              className={cn("rounded-xl border p-2 transition-colors", prefs.statusBubbleStyle === s.id ? "border-primary ring-1 ring-primary" : "border-border")}
              style={{ background: theme.bg, color: theme.text }}>
              <span className="status-bubble !animate-none !max-w-none" data-style={s.id} data-pos="top" style={{ display: "inline-block" }}>{t(`studio.status.style.${s.id}`)}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="input-label">{t("studio.status.bg")}</p>
          <div className="flex items-center gap-2">
            <input type="color" aria-label={t("studio.status.bgLabel")} value={prefs.statusBubbleBg ?? "#0d0d12"} onChange={(e) => setPref("statusBubbleBg", e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-border bg-transparent" />
            {prefs.statusBubbleBg && <Button variant="outline" type="button" onClick={() => setPref("statusBubbleBg", null)} className="text-xs text-muted-foreground underline">{t("studio.status.reset")}</Button>}
          </div>
          <p className="text-xs text-muted-foreground">{t("studio.status.contrast")}</p>
        </div>
        <div className="space-y-2">
          <p className="input-label">{t("studio.status.font")}</p>
          <div className="flex flex-wrap gap-2">
            {BUBBLE_FONTS.map((f) => (
              <Button variant="outline" key={f.id} type="button" aria-pressed={prefs.statusBubbleFont === f.id} onClick={() => setPref("statusBubbleFont", f.id)} className={pill(prefs.statusBubbleFont === f.id)} style={{ fontFamily: f.css }}>{t(`studio.status.font.${f.id}`)}</Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
