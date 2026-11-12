import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { InfoHint } from "@/components/InfoHint";
import { CustomizeButton } from "@/components/dashboard/DesignTabEditor";
import { StudioChip } from "@/components/studio/StudioChip";
import { cn } from "@/lib/utils";
import {
  VISIT_EFFECTS,
  VISIT_EFFECT_TEST_EVENT,
  runVisitEffect,
  type VisitEffect,
} from "@/lib/visit-effects";
import {
  MAX_VISIT_EMOJIS,
  normalizeVisitCustom,
  runCustomVisitEffect,
  splitGraphemes,
  type VisitDirection,
  type VisitEffectCustom,
  type VisitFloor,
  type VisitRamp,
} from "@/lib/visit-effect-custom";

const DIRECTIONS: [VisitDirection, string][] = [["down", "Omlaag"], ["up", "Omhoog"], ["diagonal", "Schuin"], ["burst", "Uit het midden"]];
const RAMPS: [VisitRamp, string][] = [["soft", "Zacht"], ["fast", "Snel"], ["instant", "Meteen"]];
const FLOORS: [VisitFloor, string][] = [["through", "Doorvallen"], ["vanish", "Blijven liggen & verdwijnen"], ["bounce", "Stuiteren"], ["splat", "Uiteenspatten"]];
const SUGGESTED = ["✨", "🎉", "💖", "🔥", "⭐", "🌸", "🎈", "🍀", "❄️", "🚀"];

/**
 * "Pagina Bezoek Effect" — vaste effecten, of via het aanpasknopje een eigen
 * emoji-effect. De test speelt af binnen de live preview van je profiel.
 */
export function VisitEffectPicker({
  value,
  onChange,
  custom,
  onCustomChange,
}: {
  value: VisitEffect;
  onChange: (next: VisitEffect) => void;
  custom: VisitEffectCustom;
  onCustomChange: (next: VisitEffectCustom) => void;
}) {
  const stopRef = useRef<(() => void) | null>(null);
  const [emojiInput, setEmojiInput] = useState("");
  useEffect(() => () => stopRef.current?.(), []);
  const open = custom.enabled;
  const set = (p: Partial<VisitEffectCustom>) => onCustomChange(normalizeVisitCustom({ ...custom, ...p }));

  const test = () => {
    stopRef.current?.();
    const detail: { effect: VisitEffect; handled: boolean; custom?: VisitEffectCustom } = { effect: value, handled: false, custom: open ? custom : undefined };
    window.dispatchEvent(new CustomEvent(VISIT_EFFECT_TEST_EVENT, { detail }));
    if (!detail.handled) stopRef.current = open ? runCustomVisitEffect(custom, { force: true, immediate: true }) : runVisitEffect(value, { force: true });
  };

  const addEmoji = (raw: string) => {
    const next = [...custom.emojis];
    for (const g of splitGraphemes(raw.trim())) {
      if (next.length >= MAX_VISIT_EMOJIS) break;
      if (g.trim() && !next.includes(g)) next.push(g);
    }
    set({ emojis: next });
    setEmojiInput("");
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <p className="input-label truncate">Pagina bezoek effect</p>
          <InfoHint label="Wat is een pagina bezoek effect?">
            Een korte animatie die één keer over je publieke profiel loopt zodra een bezoeker de
            pagina opent. De test speelt het af in je voorbeeld.
          </InfoHint>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!open && value === "none"} onClick={test}>
            <Play className="h-3.5 w-3.5" aria-hidden /> Test
          </Button>
          <CustomizeButton open={open} onToggle={() => set({ enabled: !open })} label="Eigen bezoekeffect" controls="visit-custom" />
        </div>
      </div>

      {!open ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VISIT_EFFECTS.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={value === e.id}
              onClick={() => onChange(e.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/50",
                value === e.id ? "border-primary bg-primary/10" : "border-border",
              )}
            >
              <span className="text-lg leading-none" aria-hidden>{e.icon}</span>
              <span className="text-[11px] font-medium leading-tight">{e.label}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{e.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <div id="visit-custom" className="space-y-4">
          <div className="space-y-2">
            <p className="input-label">Emoji's ({custom.emojis.length}/{MAX_VISIT_EMOJIS})</p>
            <div className="flex flex-wrap gap-1.5">
              {custom.emojis.map((e) => (
                <button key={e} type="button" aria-label={`${e} verwijderen`} disabled={custom.emojis.length <= 1} onClick={() => set({ emojis: custom.emojis.filter((x) => x !== e) })} className="inline-flex h-9 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 text-base disabled:opacity-60">
                  {e}<X className="h-3 w-3 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
            {custom.emojis.length < MAX_VISIT_EMOJIS && <>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED.filter((e) => !custom.emojis.includes(e)).map((e) => (
                  <button key={e} type="button" onClick={() => addEmoji(e)} className="h-9 w-9 rounded-full border border-border text-base hover:bg-muted/50">{e}</button>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); addEmoji(emojiInput); }}>
                <Input value={emojiInput} onChange={(ev) => setEmojiInput(ev.target.value)} placeholder="Plak of typ een emoji" maxLength={16} className="h-9" />
                <Button type="submit" size="sm" variant="outline" disabled={!emojiInput.trim()}>Toevoegen</Button>
              </form>
            </>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><p className="input-label">Duur ({custom.duration}s)</p><Slider min={1} max={10} step={1} value={[custom.duration]} onValueChange={([v]) => set({ duration: v ?? custom.duration })} /></div>
            <div className="space-y-2"><p className="input-label">Hoeveelheid ({custom.amount})</p><Slider min={5} max={80} step={1} value={[custom.amount]} onValueChange={([v]) => set({ amount: v ?? custom.amount })} /></div>
          </div>
          <div className="space-y-2"><p className="input-label">Richting</p><div className="flex flex-wrap gap-1.5">{DIRECTIONS.map(([id, l]) => <StudioChip key={id} active={custom.direction === id} onClick={() => set({ direction: id })}>{l}</StudioChip>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><p className="input-label">Opbouw</p><div className="flex flex-wrap gap-1.5">{RAMPS.map(([id, l]) => <StudioChip key={id} active={custom.rampIn === id} onClick={() => set({ rampIn: id })}>{l}</StudioChip>)}</div></div>
            <div className="space-y-2"><p className="input-label">Afbouw</p><div className="flex flex-wrap gap-1.5">{RAMPS.map(([id, l]) => <StudioChip key={id} active={custom.rampOut === id} onClick={() => set({ rampOut: id })}>{l}</StudioChip>)}</div></div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">Vervagen naarmate het verder gaat<Switch checked={custom.fade} onCheckedChange={(v) => set({ fade: v })} /></label>
          {!custom.fade && custom.direction === "down" && (
            <div className="space-y-2"><p className="input-label">Onderaan</p><div className="flex flex-wrap gap-1.5">{FLOORS.map(([id, l]) => <StudioChip key={id} active={custom.floor === id} onClick={() => set({ floor: id })}>{l}</StudioChip>)}</div></div>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Speelt één keer bij het openen van je profiel, en niet bij “verminderde beweging”.</p>
    </section>
  );
}
