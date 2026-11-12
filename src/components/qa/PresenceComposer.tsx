import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlignCenter, AlignLeft, AlignRight, Download, Image as ImageIcon, Loader2, Radio, Send, Share2, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { postPresence } from "@/lib/ephemeral.functions";
import { MICRO_TEXT_MAX, PULSE_ALIGNS, PULSE_BGS, PULSE_FONTS, PULSE_STICKERS, presenceKey, spotlightCandidates, type PulseAlign, type PulseBg, type PulseFont, type StatusInput } from "@/lib/presence";
import { pendingStatuses, savePending, removePending } from "@/lib/presence-local";
import { shareStoryFile, supportsStoryShare } from "@/lib/qa/native-share";
import type { ProfileBlock } from "@/lib/profile";
import { ProceduralStoryBackground } from "./ProceduralStoryBackground";
import { PulseText } from "@/components/presence/PulseText";
import { cn } from "@/lib/utils";
import { galleryImageSrc } from "@/lib/image-proxy-rules";

const QUICK = ["presence.quick.bored", "presence.quick.gaming", "presence.quick.working", "presence.quick.music", "presence.quick.coffee", "presence.quick.live"] as const;
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

/**
 * Story-style pulse composer: text on a background with font, alignment and one
 * sticker, or a spotlight on published profile content. Styles are closed enums
 * validated again on the server and in the database.
 */
export function PresenceComposer({ owner, handle, space, blocks, label, variant = "outline", onPosted }: {
  owner: string; handle: string; space: "root" | "alias"; blocks: ProfileBlock[];
  label?: string; variant?: "outline" | "default"; onPosted?: () => void;
}) {
  const { t } = useI18n(); const query = useQueryClient(); const post = useServerFn(postPresence);
  const [open, setOpen] = useState(false), [mode, setMode] = useState<"text" | "grid">("text"), [text, setText] = useState("");
  const [bg, setBg] = useState<PulseBg>("forest"), [font, setFont] = useState<PulseFont>("classic"), [align, setAlign] = useState<PulseAlign>("center");
  const [sticker, setSticker] = useState<string | null>(null);
  const [selected, setSelected] = useState(""), [busy, setBusy] = useState(false);
  const scope = JSON.stringify([owner, handle, space]);
  const [pendingState, setPendingState] = useState<{ scope: string; rows: StatusInput[] }>({ scope: "", rows: [] });
  const pending = pendingState.scope === scope ? pendingState.rows : [];
  const setPending = (update: (rows: StatusInput[]) => StatusInput[]) => setPendingState((state) => ({ scope, rows: update(state.scope === scope ? state.rows : []) }));
  const [file, setFile] = useState<File | null>(null), [encoding, setEncoding] = useState(false);
  const candidates = spotlightCandidates(blocks);
  const length = [...text].length;
  useEffect(() => { let alive = true; void pendingStatuses(owner).then((rows) => { if (alive) setPendingState({ scope, rows: rows.filter((r) => r.input.space === space && r.handle === handle).map((r) => r.input) }); }).catch(() => undefined); return () => { alive = false; }; }, [owner, handle, space, scope]);
  // Prepare before the sharing click: recording for 3 seconds cannot preserve transient OS activation.
  useEffect(() => {
    setFile(null); if (!open || mode !== "text" || !text.trim() || length > MICRO_TEXT_MAX) return;
    const controller = new AbortController(); let alive = true;
    const timeout = setTimeout(() => { setEncoding(true); void import("@/lib/qa/story-video").then((m) => m.renderPresenceVideo(text, controller.signal)).then((f) => { if (alive) setFile(f); }).catch(() => undefined).finally(() => { if (alive) setEncoding(false); }); }, 600);
    return () => { alive = false; clearTimeout(timeout); controller.abort(); setEncoding(false); };
  }, [open, text, mode, length]);
  const send = async (input: StatusInput) => {
    setBusy(true);
    try {
      await savePending(owner, handle, input).catch(() => undefined); setPending((rows) => [...rows.filter((r) => r.id !== input.id), input]);
      window.dispatchEvent(new CustomEvent("rout-presence-pending", { detail: { owner, handle, space, input } }));
      await post({ data: input }); await removePending(owner, input.id).catch(() => undefined); setPending((rows) => rows.filter((r) => r.id !== input.id));
      await query.invalidateQueries({ queryKey: presenceKey(space, handle) }); await query.invalidateQueries({ queryKey: ["my-pulses"] });
      window.dispatchEvent(new CustomEvent("rout-presence-confirmed", { detail: { owner, handle, space, id: input.id } }));
      setOpen(false); setText(""); setSticker(null); toast.success(t("presence.sent")); onPosted?.();
    } catch { toast.error(t("presence.pending")); } finally { setBusy(false); }
  };
  const submit = () => {
    const candidate = candidates.find((c) => `${c.blockId}:${c.itemId ?? ""}` === selected); if (mode === "grid" && !candidate) return;
    const id = crypto.randomUUID();
    // Only non-default style keys are sent, so plain pulses stay valid on older schemas.
    const style = { ...(bg !== "none" ? { bg } : {}), ...(font !== "classic" ? { font } : {}), ...(align !== "center" ? { align } : {}), ...(sticker ? { sticker: sticker as (typeof PULSE_STICKERS)[number] } : {}) };
    void send(mode === "text"
      ? { id, space, statusType: "micro_text", payload: { text: text.trim(), theme: "aurora", ...style } }
      : { id, space, statusType: "omni_drop", payload: { blockId: candidate?.blockId ?? "", ...(candidate?.itemId ? { itemId: candidate.itemId } : {}) } });
  };
  const nextFont = () => setFont(PULSE_FONTS[(PULSE_FONTS.indexOf(font) + 1) % PULSE_FONTS.length]);
  const AlignIcon = ALIGN_ICON[align];
  return <>
    <Button variant={variant} className="w-full justify-start gap-2" onClick={() => setOpen(true)}><Radio className="h-4 w-4" />{label ?? t("presence.update")}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("presence.update")}</DialogTitle><DialogDescription>{t("presence.composerHelp")}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2" role="tablist">
          <Button role="tab" aria-selected={mode === "text"} className="h-auto gap-2 whitespace-normal" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")}><Type className="h-4 w-4" />{t("presence.write")}</Button>
          <Button role="tab" aria-selected={mode === "grid"} className="h-auto gap-2 whitespace-normal" variant={mode === "grid" ? "default" : "outline"} onClick={() => setMode("grid")}><ImageIcon className="h-4 w-4" />{t("presence.grid")}</Button>
        </div>
        {mode === "text" ? <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <div className="relative mx-auto aspect-[9/16] w-40 overflow-hidden rounded-2xl bg-story-viewport text-story-card shadow-lg">
            {bg === "none" && <ProceduralStoryBackground />}
            <PulseText text={text || t("presence.placeholder")} bg={bg} font={font} align={align} sticker={sticker} size="sm" className={cn(!text && "opacity-60")} />
          </div>
          <div className="space-y-3">
            <Textarea aria-label={t("presence.write")} placeholder={t("presence.placeholder")} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={MICRO_TEXT_MAX * 2} />
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-xs", length > MICRO_TEXT_MAX ? "text-destructive" : "text-muted-foreground")}>{length}/{MICRO_TEXT_MAX}</span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={nextFont} aria-label={t("presence.font")}><Type className="h-4 w-4" /><span className={cn("text-xs", `pulse-font-${font}`)}>{t(`presence.fonts.${font}`)}</span></Button>
                <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label={t("presence.align")} onClick={() => setAlign(PULSE_ALIGNS[(PULSE_ALIGNS.indexOf(align) + 1) % PULSE_ALIGNS.length])}><AlignIcon className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("presence.background")}</p>
              <div className="flex flex-wrap gap-1.5">
                {PULSE_BGS.map((b) => (
                  <button key={b} type="button" aria-label={t(`presence.bgs.${b}`)} aria-pressed={bg === b} onClick={() => setBg(b)}
                    className={cn("h-8 w-8 rounded-full border border-border bg-story-viewport ring-offset-2 ring-offset-background transition", b !== "none" && `pulse-bg-${b}`, bg === b && "ring-2 ring-ring")} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("presence.sticker")}</p>
              <div className="flex flex-wrap gap-1">
                {PULSE_STICKERS.map((s) => (
                  <button key={s} type="button" aria-pressed={sticker === s} onClick={() => setSticker(sticker === s ? null : s)}
                    className={cn("h-9 w-9 rounded-lg border border-border text-lg transition hover:bg-muted", sticker === s && "border-primary bg-primary/10")}>{s}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {QUICK.map((k) => <Button key={k} type="button" size="sm" variant="ghost" className="h-7 rounded-full border border-border px-2.5 text-xs" onClick={() => setText(t(k))}>{t(k)}</Button>)}
            </div>
            {encoding && <Loader2 aria-label={t("presence.encoding")} className="h-4 w-4 animate-spin" />}
            {file && <Button variant="outline" size="sm" onClick={() => { if (supportsStoryShare(file)) void shareStoryFile(file).catch(() => toast.error(t("presence.shareFailed"))); else { const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } }}>{supportsStoryShare(file) ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}{t(supportsStoryShare(file) ? "presence.share" : "presence.download")}</Button>}
          </div>
        </div> : <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">{candidates.length ? candidates.map((c) => {
          const key = `${c.blockId}:${c.itemId ?? ""}`;
          return <button key={key} type="button" aria-pressed={selected === key} onClick={() => setSelected(key)} className={cn("overflow-hidden rounded-xl border border-border text-left transition hover:bg-muted", selected === key && "ring-2 ring-ring")}>
            {galleryImageSrc(c.mediaUrl) ? <img src={galleryImageSrc(c.mediaUrl) ?? undefined} alt="" className="aspect-square w-full object-cover" loading="lazy" /> : <span className="flex aspect-square w-full items-center justify-center bg-muted"><ImageIcon className="h-6 w-6 text-muted-foreground" /></span>}
            <span className="block truncate px-2 py-1.5 text-xs font-medium">{c.title}</span>
          </button>;
        }) : <p className="col-span-2 text-sm text-muted-foreground">{t("presence.noGrid")}</p>}</div>}
        <Button disabled={busy || (mode === "text" ? (!text.trim() || length > MICRO_TEXT_MAX) : !selected)} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t("presence.publish")}</Button>
        {pending.map((input) => <div key={input.id} className="flex gap-2 border-t border-border pt-2"><Button variant="outline" disabled={busy} onClick={() => void send(input)}>{t("presence.retry")}</Button><Button variant="ghost" size="icon" aria-label={t("presence.discard")} onClick={() => void removePending(owner, input.id).then(() => setPending((rows) => rows.filter((r) => r.id !== input.id)))}><Trash2 className="h-4 w-4" /></Button></div>)}
      </DialogContent>
    </Dialog>
  </>;
}
