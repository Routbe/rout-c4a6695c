/**
 * Design-secties van de Studio: presets, wallpaper, knoppen, typografie en
 * footer/branding. Elke sectie is los exporteerbaar zodat ze in de juiste
 * accordeon-map van de Studio staat (geen aparte "Design Customizer"-map meer).
 * Alle wijzigingen gaan rechtstreeks naar de state van de ProfileEditor, zodat
 * het sticky voorbeeld live meebeweegt.
 */
import { SlidersHorizontal } from "lucide-react";
import { TITLE_EFFECTS, TITLE_ENTRANCES } from "@/lib/title-typography";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { hexToHsl, hslToHex } from "@/lib/color-hsl";
import { themeOf } from "@/lib/profile";
import {
  BUTTON_RADII,
  BUTTON_EFFECTS,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  FONT_PAIRINGS,
  FOOTER_STYLES,
  GRADIENT_PRESETS,
  GRADIENT_DIRECTIONS,
  BACKGROUND_STYLES,
  ROUT_PRESETS,
  SOCIAL_POSITIONS,
  WALLPAPER_TYPES,
  designButtonStyle,
  fontPairingOf,
  gradientCss,
  presetPrefEntries,
  type ProfileDisplayPrefs,
} from "@/lib/profile-display";

type SetPref = <K extends keyof ProfileDisplayPrefs>(
  key: K,
  value: ProfileDisplayPrefs[K],
) => void;

/** Knopafronding in px, voor de previewtegels. */
export const radiusPx = (id: ProfileDisplayPrefs["buttonRadius"] | undefined) =>
  (BUTTON_RADII.find((r) => r.id === id) ?? BUTTON_RADII[2])?.px ?? 8;

/** Kleurkiezer met tint-, verzadiging- en helderheidsschuifjes; slaat hex op. */
function AdvancedColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const hsl = hexToHsl(value ?? placeholder ?? "#111111") ?? { h: 0, s: 0, l: 7 };
  const set = (k: "h" | "s" | "l", n: number) => onChange(hslToHex({ ...hsl, [k]: n }));
  const rows: { k: "h" | "s" | "l"; label: string; max: number; track: string }[] = [
    { k: "h", label: "Tint", max: 360, track: "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" },
    { k: "s", label: "Verzadiging", max: 100, track: `linear-gradient(90deg,${hslToHex({ ...hsl, s: 0 })},${hslToHex({ ...hsl, s: 100 })})` },
    { k: "l", label: "Helderheid", max: 100, track: `linear-gradient(90deg,#000,${hslToHex({ ...hsl, l: 50 })},#fff)` },
  ];
  return (
    <div className="space-y-3">
      <ColorField label={label} value={value} onChange={onChange} placeholder={placeholder} />
      {rows.map((r) => (
        <label key={r.k} className="block space-y-1">
          <span className="flex justify-between text-[11px] text-muted-foreground">
            <span>{r.label}</span>
            <span className="font-mono">{hsl[r.k]}{r.k === "h" ? "°" : "%"}</span>
          </span>
          <input
            type="range"
            min={0}
            max={r.max}
            value={hsl[r.k]}
            aria-label={r.label}
            onChange={(e) => set(r.k, Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full accent-foreground"
            style={{ background: r.track }}
          />
        </label>
      ))}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  placeholder = "#0d0d0d",
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="input-label">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value ?? "#111111"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-1"
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={placeholder}
          spellCheck={false}
          className="h-10 font-mono text-xs"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 shrink-0 text-xs"
            onClick={() => onChange(null)}
          >
            Wis
          </Button>
        )}
      </div>
    </div>
  );
}

const Pill = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
      active ? "border-primary/50 bg-primary/10" : "border-border",
    )}
  >
    {children}
  </button>
);

/**
 * Preview-tegel in Linktree-stijl: toont de achtergrond, de tekstkleur ("Aa")
 * en de knopvorm/kleur van een thema of preset in één blik.
 */
export function DesignTile({
  background,
  textColor,
  buttonColor,
  buttonTextColor,
  radius = 999,
  label,
  active,
  onClick,
}: {
  background: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor?: string;
  radius?: number;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-col gap-2 text-left"
    >
      <span
        className={cn(
          "relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-xl border p-1.5 transition-all sm:p-2",
          active ? "border-primary ring-2 ring-primary" : "border-border",
        )}
        style={{ background }}
        aria-hidden
      >
        <span className="text-xs font-semibold leading-none sm:text-sm" style={{ color: textColor }}>
          Aa
        </span>
        <span
          className="block h-3 w-full border sm:h-4"
          style={{
            background: buttonColor,
            borderColor: buttonTextColor ?? textColor,
            borderRadius: radius,
          }}
        />
      </span>
      <span className="truncate text-[10px] font-medium sm:text-[11px]">{label}</span>
    </button>
  );
}

/** Ronde "aanpassen"-knop, dezelfde als bij Achtergrond & Visual FX. */
export function CustomizeButton({ open, onToggle, label, controls }: { open: boolean; onToggle: () => void; label: string; controls: string }) {
  return (
    <Button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      title={label}
      onClick={onToggle}
      variant="ghost"
      size="icon"
      className={cn(
        "size-11 shrink-0 rounded-full p-0 transition-colors sm:size-9",
        open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <SlidersHorizontal className="h-4 w-4" />
    </Button>
  );
}

/** Uitklapblok dat alleen zichtbaar en bedienbaar is als "aanpassen" aanstaat. */
function CustomCollapse({ open, id, children }: { open: boolean; id: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!open}
      inert={!open || undefined}
    >
      <div className="min-h-0 space-y-4 overflow-hidden">{children}</div>
    </div>
  );
}

/** Presets + custom mode — hoort bij "Thema & Kleurenschema". */
export function DesignPresetSection({
  prefs,
  setPref,
  theme,
  setTheme,
  setCardStyle,
}: {
  prefs: ProfileDisplayPrefs;
  setPref: SetPref;
  theme: string;
  setTheme: (id: string) => void;
  setCardStyle: (id: string) => void;
}) {
  const applyPreset = (id: string) => {
    const preset = ROUT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setTheme(preset.themeId);
    setCardStyle(preset.cardStyle);
    for (const [key, value] of presetPrefEntries(preset.design as Record<string, unknown>)) {
      setPref(key as keyof ProfileDisplayPrefs, value as never);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">ROUT-presets</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Eén klik zet kleuren, knoppen en typografie in één luxe ROUT-stijl.
          </p>
        </div>
        <button
          type="button"
          aria-label="Achtergrond aanpassen"
          aria-expanded={prefs.backgroundCustom}
          aria-controls="bg-advanced"
          title="Achtergrond aanpassen"
          onClick={() => setPref("backgroundCustom", !prefs.backgroundCustom)}
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            prefs.backgroundCustom
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>
      {!prefs.backgroundCustom && <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {ROUT_PRESETS.map((p) => {
          const pt = themeOf(p.themeId);
          const design = p.design as Partial<ProfileDisplayPrefs>;
          return (
            <DesignTile
              key={p.id}
              label={p.label}
              active={theme === p.themeId}
              onClick={() => applyPreset(p.id)}
              background={
                design.wallpaperGradient
                  ? gradientCss(design.wallpaperGradient)
                  : (design.wallpaperColor ?? pt.bg)
              }
              textColor={design.titleColor ?? pt.text}
              buttonColor={design.buttonColor ?? pt.accent ?? pt.card}
              buttonTextColor={design.buttonTextColor ?? pt.text}
              radius={radiusPx(design.buttonRadius)}
            />
          );
        })}
      </div>}
    </section>
  );
}

/** Wallpaper — hoort bij "Achtergrond & Visual FX". Fijnregeling verschijnt pas met de schakelaar aan. */
export function DesignWallpaperSection({
  prefs,
  setPref,
  theme,
  extra,
}: {
  prefs: ProfileDisplayPrefs;
  setPref: SetPref;
  theme: string;
  /** Extra fijnregeling (bv. bezoekeffect) onderaan het uitklapblok. */
  extra?: React.ReactNode;
}) {
  const t = themeOf(theme);
  const open = prefs.backgroundCustom;
  return (
    <section className="space-y-4">
      <div
        id="bg-advanced"
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!open}
        inert={!open || undefined}
      >
      <div className="min-h-0 space-y-4 overflow-hidden">
      <p className="input-label">Achtergrondtype</p>
      <div className="flex flex-wrap gap-2">
        {WALLPAPER_TYPES.map((o) => (
          <Pill
            key={o.id}
            active={prefs.wallpaperType === o.id}
            onClick={() => setPref("wallpaperType", o.id)}
          >
            {o.label}
          </Pill>
        ))}
      </div>

      {(prefs.wallpaperType === "solid" || prefs.wallpaperType === "mesh-flow" || prefs.wallpaperType === "grid-scroll" || prefs.wallpaperType === "fluid-wave") && (
        <>
          {/* Eén bron voor de vlakke achtergrondkleur: dezelfde `canvasColor`
              als in 🎨 Thema & Kleurenschema, geen tweede kleurveld meer. */}
          <AdvancedColorField
            label="Achtergrondkleur"
            value={prefs.canvasColor ?? prefs.wallpaperColor}
            onChange={(v) => {
              setPref("canvasColor", v);
              setPref("wallpaperColor", v);
            }}
            placeholder={t.bg}
          />
          <p className="text-[11px] text-muted-foreground">
            Deze kleur is dezelfde als de canvaskleur in 🎨 Thema &amp; Kleurenschema.
          </p>
        </>
      )}

      {prefs.wallpaperType === "gradient" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GRADIENT_PRESETS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setPref("wallpaperGradient", g.id)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors",
                prefs.wallpaperGradient === g.id
                  ? "border-primary ring-1 ring-primary"
                  : "border-border",
              )}
            >
              <span
                className="block h-10 w-full rounded-lg border border-border"
                style={{ background: g.css }}
                aria-hidden
              />
              <span className="text-xs font-medium">{g.label}</span>
            </button>
          ))}
        </div>
      )}

      {prefs.wallpaperType === "gradient" && (
        <>
          <p className="input-label">Richting van het verloop</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Richting van het verloop">
            {GRADIENT_DIRECTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={prefs.wallpaperGradientDirection === d.id}
                onClick={() => setPref("wallpaperGradientDirection", d.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] font-medium transition-colors",
                  prefs.wallpaperGradientDirection === d.id ? "border-primary ring-1 ring-primary" : "border-border",
                )}
              >
                <span
                  aria-hidden
                  className="block h-8 w-full rounded-md border border-border"
                  style={{ background: gradientCss(prefs.wallpaperGradient, d.id) }}
                />
                {d.label}
              </button>
            ))}
          </div>
        </>
      )}

      {prefs.wallpaperType === "image" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="input-label">Afbeeldings-URL (https)</p>
            <Input
              value={prefs.wallpaperImageUrl ?? ""}
              onChange={(e) => setPref("wallpaperImageUrl", e.target.value || null)}
              placeholder="https://…/wallpaper.jpg"
              spellCheck={false}
              className="h-10 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <p className="input-label">Blur ({prefs.wallpaperBlur}px)</p>
            <Slider
              value={[prefs.wallpaperBlur]}
              min={0}
              max={24}
              step={1}
              onValueChange={([v]) => setPref("wallpaperBlur", v ?? 0)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="input-label">Donkere overlay ({prefs.wallpaperOverlay}%)</p>
            <Slider
              value={[prefs.wallpaperOverlay]}
              min={0}
              max={90}
              step={5}
              onValueChange={([v]) => setPref("wallpaperOverlay", v ?? 0)}
            />
          </div>
        </div>
      )}

      <p className="input-label border-t border-border pt-4">Achtergrondstijl</p>
      <div className="flex flex-wrap gap-2">
        {BACKGROUND_STYLES.map((o) => (
          <Pill key={o.id} active={prefs.backgroundStyle === o.id} onClick={() => setPref("backgroundStyle", o.id)}>
            {o.label}
          </Pill>
        ))}
      </div>
      {extra && <div className="border-t border-border pt-4">{extra}</div>}
      </div>
      </div>
    </section>
  );
}

/** Knopstijl + typografie-fijnregeling — hoort bij "Knoppen & Typografie". */
export function DesignButtonsTypographySection({
  prefs,
  setPref,
  theme,
  inlineControls = false,
  section = "both",
}: {
  prefs: ProfileDisplayPrefs;
  setPref: SetPref;
  theme: string;
  inlineControls?: boolean;
  section?: "buttons" | "typography" | "both";
}) {
  const t = themeOf(theme);
  const preview = (patch: Partial<ProfileDisplayPrefs>) =>
    designButtonStyle({ ...prefs, ...patch, buttonsCustom: true, buttonSize: "sm" }, t) ?? {};
  return (
    <div className="space-y-5">
      {section !== "typography" && <section className="space-y-3">
        {!inlineControls && <div className="flex min-w-0 items-center gap-2">
          <p className="input-label">Knopvorm</p>
          <CustomizeButton open={prefs.buttonsCustom} onToggle={() => setPref("buttonsCustom", !prefs.buttonsCustom)} label="Knoppen aanpassen" controls="buttons-advanced" />
        </div>}
        <p className="input-label">Links weergeven als</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Links weergeven als">
          {([["bar", "Balken"], ["icon", "Icoontjes onder bio"], ["both", "Beide"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={prefs.buttonShape === id} onClick={() => setPref("buttonShape", id)}
              className={cn("flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium", prefs.buttonShape === id ? "border-primary ring-1 ring-primary" : "border-border")}>
              <span className="flex h-9 w-full items-center justify-center gap-1.5">
                {id !== "bar" && [0, 1, 2].map((i) => <span key={i} className="h-5 w-5 rounded-full" style={{ background: t.accent ?? t.text }} />)}
                {id !== "icon" && <span className="h-5 flex-1 rounded-md border border-current" style={{ color: t.text }} />}
              </span>
              {label}
            </button>
          ))}
        </div>
        {prefs.buttonShape === "icon" && (
          <p role="note" className="rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
            Alleen icoontjes is minder duidelijk voor sommige bezoekers; de naam van elke link blijft voor schermlezers beschikbaar.
          </p>
        )}
        <CustomCollapse open={prefs.buttonsCustom} id="buttons-advanced">
          <p className="input-label pt-2">Knopstijl</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BUTTON_VARIANTS.map((v) => (
              <button key={v.id} type="button" onClick={() => setPref("buttonVariant", v.id)} aria-pressed={prefs.buttonVariant === v.id}
                className={cn("space-y-2 rounded-xl border p-2.5 text-left transition-colors", prefs.buttonVariant === v.id ? "border-primary ring-1 ring-primary" : "border-border")}>
                <span className="flex h-12 items-center justify-center rounded-lg px-2" style={{ background: t.bg }} aria-hidden>
                  <span className="flex h-7 w-full items-center justify-center text-[10px] font-medium" style={{ ...preview({ buttonVariant: v.id }), borderRadius: radiusPx(prefs.buttonRadius), border: v.id.toLowerCase().includes("outline") || v.id.toLowerCase().includes("ghost") ? `2px solid ${t.accent ?? t.text}` : "2px solid transparent", background: v.id.toLowerCase().includes("outline") || v.id.toLowerCase().includes("ghost") ? "transparent" : (t.accent ?? t.text), color: v.id.toLowerCase().includes("outline") || v.id.toLowerCase().includes("ghost") ? (t.accent ?? t.text) : t.bg }}>Link</span>
                </span>
                <span className="block text-xs font-medium">{v.label}</span>
                <span className="block text-[10px] leading-snug text-muted-foreground">{v.note}</span>
              </button>
            ))}
          </div>
          <p className="input-label pt-2">Hoekafronding</p>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Hoekafronding">
            {BUTTON_RADII.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={prefs.buttonRadius === r.id} onClick={() => setPref("buttonRadius", r.id)}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[10px] font-medium", prefs.buttonRadius === r.id ? "border-primary ring-1 ring-primary" : "border-border")}>
                <span className="block h-7 w-full border-2 border-current" style={{ borderRadius: r.px }} aria-hidden />
                {r.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <ColorField label="Knopkleur" value={prefs.buttonColor} onChange={(v) => setPref("buttonColor", v)} />
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-3">
                <span className="input-label">Knoprand</span>
                <Switch
                  checked={prefs.buttonBorderColor !== null}
                  onCheckedChange={(on) => setPref("buttonBorderColor", on ? (t.accent ?? t.text) : null)}
                  aria-label="Knoprand aan of uit"
                />
              </label>
              {prefs.buttonBorderColor !== null && (
                <ColorField label="Knoprandkleur" value={prefs.buttonBorderColor} onChange={(v) => setPref("buttonBorderColor", v)} placeholder={t.accent ?? t.text} />
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><p className="input-label">Knopgrootte</p><Select value={prefs.buttonSize} onValueChange={(v) => setPref("buttonSize", v as ProfileDisplayPrefs["buttonSize"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUTTON_SIZES.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><p className="input-label">Beweging</p><Select value={prefs.buttonEffect} onValueChange={(v) => setPref("buttonEffect", v as ProfileDisplayPrefs["buttonEffect"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUTTON_EFFECTS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label} — {o.hint}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </CustomCollapse>
      </section>}

      {section !== "buttons" && <section className={cn("space-y-3", section === "both" && "border-t border-border pt-4")}>
        {!inlineControls && <div className="flex min-w-0 items-center gap-2">
          <p className="input-label">Typografie</p>
          <CustomizeButton open={prefs.typographyCustom} onToggle={() => setPref("typographyCustom", !prefs.typographyCustom)} label="Typografie aanpassen" controls="type-advanced" />
        </div>}
        <CustomCollapse open={prefs.typographyCustom} id="type-advanced">
          <Select value={prefs.fontPairing} onValueChange={(v) => setPref("fontPairing", v as ProfileDisplayPrefs["fontPairing"])}>
            <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Kies een fontpaar" /></SelectTrigger>
            <SelectContent>{FONT_PAIRINGS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label} — {f.note}</SelectItem>)}</SelectContent>
          </Select>
          <div className="rounded-xl border border-border p-3">
            <p className="text-lg" style={{ fontFamily: fontPairingOf(prefs.fontPairing).heading }}>{fontPairingOf(prefs.fontPairing).label}</p>
            <p className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: fontPairingOf(prefs.fontPairing).body }}>Zo leest je bio en je knoptekst op het publieke profiel.</p>
          </div>
          <div className="space-y-1.5"><p className="input-label">Tekstgrootte ({prefs.fontScale}%)</p><Slider value={[prefs.fontScale]} min={85} max={125} step={5} onValueChange={([v]) => setPref("fontScale", v ?? 100)} /></div>
          <div className="space-y-1.5"><p className="input-label">Titelgrootte ({prefs.titleScale}%)</p><Slider value={[prefs.titleScale]} min={80} max={180} step={5} onValueChange={([v]) => setPref("titleScale", v ?? 100)} /></div>
          <div className="space-y-1.5"><p className="input-label">Letterafstand ({prefs.titleLetterSpacing}px)</p><Slider value={[prefs.titleLetterSpacing]} min={-1} max={12} step={1} onValueChange={([v]) => setPref("titleLetterSpacing", v ?? 0)} /></div>
          <div className="space-y-1.5"><p className="input-label">Tekstgloed ({prefs.titleGlow}px)</p><Slider value={[prefs.titleGlow]} min={0} max={40} step={2} onValueChange={([v]) => setPref("titleGlow", v ?? 0)} /></div>
          <label className="flex items-center justify-between gap-3 text-xs"><span>Gradient Mode</span><Switch aria-label="Gradient Mode" checked={Boolean(prefs.titleGradientTo)} onCheckedChange={(on) => setPref("titleGradientTo", on ? (prefs.titleColor ?? t.text) : null)} /></label>
          {prefs.titleGradientTo && <ColorField label="Eindkleur" value={prefs.titleGradientTo} onChange={(v) => setPref("titleGradientTo", v)} placeholder={t.text} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><p className="input-label">Schaduwvervaging ({prefs.titleShadowBlur}px)</p><Slider aria-label="Schaduwvervaging" value={[prefs.titleShadowBlur]} min={0} max={40} step={1} onValueChange={([v]) => setPref("titleShadowBlur", v ?? 0)} /></div>
            <ColorField label="Schaduwkleur" value={prefs.titleShadowColor} onChange={(v) => setPref("titleShadowColor", v)} />
            <div className="space-y-1.5"><p className="input-label">Schaduw X ({prefs.titleShadowX}px)</p><Slider aria-label="Schaduw X" value={[prefs.titleShadowX]} min={-20} max={20} step={1} onValueChange={([v]) => setPref("titleShadowX", v ?? 0)} /></div>
            <div className="space-y-1.5"><p className="input-label">Schaduw Y ({prefs.titleShadowY}px)</p><Slider aria-label="Schaduw Y" value={[prefs.titleShadowY]} min={-20} max={20} step={1} onValueChange={([v]) => setPref("titleShadowY", v ?? 0)} /></div>
            <label className="space-y-1.5"><span className="input-label">Elementair Effect</span><Select value={prefs.titleEffect} onValueChange={(v) => setPref("titleEffect", v as ProfileDisplayPrefs["titleEffect"])}><SelectTrigger aria-label="Elementair Effect"><SelectValue /></SelectTrigger><SelectContent>{TITLE_EFFECTS.map((fx) => <SelectItem key={fx.id} value={fx.id}>{fx.label}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1.5"><span className="input-label">Verschijningsvorm</span><Select value={prefs.titleEntrance} onValueChange={(v) => setPref("titleEntrance", v as ProfileDisplayPrefs["titleEntrance"])}><SelectTrigger aria-label="Verschijningsvorm"><SelectValue /></SelectTrigger><SelectContent>{TITLE_ENTRANCES.map((fx) => <SelectItem key={fx.id} value={fx.id}>{fx.label}</SelectItem>)}</SelectContent></Select></label>
          </div>
          <div className="space-y-1.5"><p className="input-label">Zichtbaarheid ({prefs.titleReveal}%)</p><Slider aria-label="Tekstzichtbaarheid" value={[prefs.titleReveal]} min={0} max={100} step={1} onValueChange={([v]) => setPref("titleReveal", v ?? 100)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label="Titelkleur" value={prefs.titleColor} onChange={(v) => setPref("titleColor", v)} placeholder={t.text} />
            <ColorField label="Knoptekstkleur" value={prefs.buttonTextColor} onChange={(v) => setPref("buttonTextColor", v)} placeholder={t.text} />
          </div>
        </CustomCollapse>
      </section>}
    </div>
  );
}

/** Footer, branding en social-positie — eigen map "Footer & Branding". */
export function DesignFooterSection({
  prefs,
  setPref,
  theme,
  verified,
}: {
  prefs: ProfileDisplayPrefs;
  setPref: SetPref;
  theme: string;
  verified: boolean;
}) {
  const t = themeOf(theme);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="input-label">Footer-tagline</p>
        <Input
          value={prefs.footerTagline ?? ""}
          maxLength={80}
          onChange={(e) => setPref("footerTagline", e.target.value || null)}
          placeholder="Made in Brussels • 2026"
          className="h-10 text-xs"
        />
      </div>
      <div className="space-y-2">
        <p className="input-label">Footerstijl</p>
        <div className="flex flex-wrap gap-2">
          {FOOTER_STYLES.map((o) => (
            <Pill
              key={o.id}
              active={prefs.footerStyle === o.id}
              onClick={() => setPref("footerStyle", o.id)}
            >
              {o.label}
            </Pill>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {FOOTER_STYLES.find((o) => o.id === prefs.footerStyle)?.hint}
        </p>
      </div>
      <ColorField
        label="Footer-accent"
        value={prefs.footerAccent}
        onChange={(v) => setPref("footerAccent", v)}
        placeholder={t.border}
      />
      <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Toon &ldquo;Powered by ROUT&rdquo;-badge</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {verified
              ? "Als geverifieerd lid mag je de attributie uitzetten."
              : "Gratis profielen tonen de badge altijd."}
          </p>
        </div>
        <Switch
          aria-label="Powered by ROUT tonen"
          disabled={!verified}
          checked={verified ? prefs.showRoutBadge : true}
          onCheckedChange={(v) => setPref("showRoutBadge", v)}
        />
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="input-label">Positie social-iconen</p>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_POSITIONS.map((o) => (
            <Pill
              key={o.id}
              active={prefs.socialPosition === o.id}
              onClick={() => setPref("socialPosition", o.id)}
            >
              {o.label}
            </Pill>
          ))}
        </div>
      </div>
    </div>
  );
}
