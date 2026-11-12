import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CustomizeButton } from "@/components/dashboard/DesignTabEditor";
import { StudioChip } from "@/components/studio/StudioChip";
import { LiquidGlassFilters, useLiquidGlassRuntime } from "@/components/glass/LiquidGlass";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import {
  applyScopedPatch,
  glassSurfaceStyle,
  hasUniqueStyle,
  resetScope,
  resolveComponentDesign,
  resolveScopedTokens,
  type GlassBorder,
  type GlassStyle,
  type GlassTargets,
  type ScopeOverride,
  type ThemeScope,
  BUTTON_SHAPE_PRESETS,
  OVERRIDE_BUTTON_VARIANTS,
  OVERRIDE_BUTTON_RADII,
} from "@/lib/theme-engine";
import { BUTTON_EFFECTS, BUTTON_RADII, BUTTON_SIZES, BUTTON_VARIANTS, FONT_PAIRINGS } from "@/lib/profile-design";

type SetPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;

/** Kort label voor gsm, lang label vanaf tablet. */
export const SCOPES: { id: ThemeScope; short: string; label: string }[] = [
  { id: "all", short: "🌐 Alles", label: "🌐 Alle elementen" },
  { id: "links", short: "🔗 Links", label: "🔗 Links" },
  { id: "widgets", short: "Widgets", label: "Widgets" },
  { id: "socials", short: "📱 Socials", label: "📱 Socials" },
  { id: "booking", short: "📅 Boeken", label: "📅 Boekingen" },
  { id: "board", short: "💬 Prikbord", label: "💬 Prikbord" },
  { id: "presence", short: "🎵 Status", label: "🎵 Live-status" },
  { id: "questions", short: "❓ Vragen", label: "❓ Anonieme vragen" },
  { id: "answers", short: "💡 Antwoorden", label: "💡 Q&A-antwoorden" },
];

/** Profiel-scopes: vragen en antwoorden zijn één venster, dus één keuze. */
export const PROFILE_SCOPES: readonly ThemeScope[] = ["all", "links", "widgets", "socials", "booking", "board", "presence", "questions"];

const GLASS_TYPES: { id: Exclude<GlassStyle, "solid">; label: string }[] = [
  { id: "frosted-light", label: "Light Glass" },
  { id: "frosted-dark", label: "Dark Glass" },
  { id: "neon", label: "Color Glass" },
  { id: "obsidian", label: "Liquid Obsidian" },
  { id: "prism", label: "Prism Edge" },
];

const BORDERS: { id: GlassBorder; label: string }[] = [
  { id: "subtle", label: "Subtiel" },
  { id: "bright", label: "Helder" },
  { id: "off", label: "Uit" },
];

type ShapePreset = { id: string; label: string; buttonVariant: ScopeOverride["buttonVariant"]; buttonRadius: ScopeOverride["buttonRadius"]; glassStyle: GlassStyle };
/** Knopvorm-presets, met en zonder glas. */
export const SHAPE_PRESETS: ShapePreset[] = [
  ...BUTTON_SHAPE_PRESETS.map((p) => ({ ...p, glassStyle: (p.id === "glass" ? "frosted-light" : "solid") as GlassStyle })),
  { id: "smoke-pill", label: "Rookglas Pill", buttonVariant: "fill", buttonRadius: "pill", glassStyle: "frosted-dark" },
  { id: "obsidian", label: "Obsidian", buttonVariant: "fill", buttonRadius: "xl", glassStyle: "obsidian" },
  { id: "prism", label: "Prism", buttonVariant: "outline", buttonRadius: "rounded", glassStyle: "prism" },
  { id: "neon-glass", label: "Color Glass", buttonVariant: "fill", buttonRadius: "pill", glassStyle: "neon" },
];

/** One-click Apple glass recipes for the customize panel (style + tuned sliders). */
const GLASS_RECIPES: { id: string; label: string; patch: ScopeOverride }[] = [
  { id: "light", label: "Light Glass", patch: { glassStyle: "frosted-light", glassOpacity: 20, glassBlur: 20, glassSaturation: 180, glassRefraction: 40, glassAberration: 15, glassSpecular: 70, glassBorder: "bright" } },
  { id: "dark", label: "Dark Glass", patch: { glassStyle: "frosted-dark", glassOpacity: 12, glassBlur: 22, glassSaturation: 160, glassRefraction: 35, glassAberration: 10, glassSpecular: 45, glassBorder: "subtle" } },
  { id: "neon", label: "Color Glass", patch: { glassStyle: "neon", glassOpacity: 15, glassBlur: 18, glassSaturation: 200, glassRefraction: 50, glassAberration: 30, glassSpecular: 60, glassBorder: "subtle" } },
  { id: "liquid", label: "Liquid Lens", patch: { glassStyle: "frosted-light", glassOpacity: 8, glassBlur: 6, glassSaturation: 190, glassRefraction: 90, glassAberration: 40, glassSpecular: 85, glassBorder: "bright" } },
];

const glassTargetOf = (scope: ThemeScope): (keyof GlassTargets)[] =>
  scope === "all" ? ["links", "presence", "board", "booking"]
    : scope === "widgets" ? ["presence", "board", "booking"]
    : scope === "links" || scope === "socials" ? ["links"]
    : scope === "booking" ? ["booking"]
    : scope === "presence" ? ["presence"]
    : ["board"];

/** Native select met compacte overlay: op 360px duwt hij de titel nooit weg. */
export function ThemeScopeSelect({ scope, onChange, allowedScopes }: { scope: ThemeScope; onChange: (s: ThemeScope) => void; allowedScopes?: readonly ThemeScope[] }) {
  const { t } = useTranslation();
  const list = SCOPES.filter((s) => (allowedScopes ?? PROFILE_SCOPES).includes(s.id));
  const cur = list.find((s) => s.id === scope) ?? list[0];
  return (
    <label className="relative inline-flex h-9 max-w-[8.5rem] shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-medium focus-within:ring-2 focus-within:ring-ring sm:max-w-none">
      <span className="truncate sm:hidden">{cur ? t(`studio.themeBar.scope.${cur.id}.short`, { defaultValue: cur.short }) : null}</span>
      <span className="hidden truncate sm:inline">{cur ? t(`studio.themeBar.scope.${cur.id}`, { defaultValue: cur.label }) : null}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <select aria-label={t("studio.themeBar.applyTo")} value={scope} onChange={(e) => onChange(e.target.value as ThemeScope)} className="absolute inset-0 cursor-pointer opacity-0">
        {list.map((s) => <option key={s.id} value={s.id}>{t(`studio.themeBar.scope.${s.id}`, { defaultValue: s.label })}</option>)}
      </select>
    </label>
  );
}

export function ScopedThemeBar({ prefs, setPref, scope = "all", showTypography = true }: { prefs: ProfileDisplayPrefs; setPref: SetPref; scope?: ThemeScope; showTypography?: boolean }) {
  const tokens = resolveScopedTokens(prefs, prefs.themeOverrides, scope);
  const unique = hasUniqueStyle(prefs, prefs.themeOverrides, scope);
  const design = resolveComponentDesign(prefs, prefs.themeOverrides, scope);
  const custom = prefs.buttonsCustom;
  const glassOn = tokens.glassStyle !== "solid";
  useLiquidGlassRuntime();
  const { t } = useTranslation();

  const widgetScope = ["widgets", "booking", "board", "presence", "questions", "answers"].includes(scope);
  const patch = (input: ScopeOverride) => {
    const p = widgetScope && input.buttonRadius === "pill" ? { ...input, buttonRadius: "rounded" as const } : input;
    if (p.glassStyle && p.glassStyle !== "solid") {
      const next = { ...prefs.glassTargets };
      for (const k of glassTargetOf(scope)) next[k] = true;
      setPref("glassTargets", next);
    }
    if (scope === "all") {
      const next = applyScopedPatch(prefs, prefs.themeOverrides, scope, p);
      (Object.keys(p) as (keyof ScopeOverride)[]).forEach((k) => setPref(k, (next.global as Record<string, unknown>)[k] as never));
      if ("fontPairing" in p) setPref("typographyCustom", true);
      return;
    }
    let next = applyScopedPatch(prefs, prefs.themeOverrides, scope, p);
    // Eén anoniem vragenvenster: vragen en antwoorden krijgen samen dezelfde stijl.
    if (scope === "questions") next = applyScopedPatch(prefs, next.overrides, "answers", p);
    setPref("themeOverrides", next.overrides);
  };
  const reset = () => {
    let o = resetScope(prefs.themeOverrides, scope as Exclude<ThemeScope, "all">);
    if (scope === "questions") o = resetScope(o, "answers");
    setPref("themeOverrides", o);
  };

  const variants = BUTTON_VARIANTS.filter((v) => (OVERRIDE_BUTTON_VARIANTS as readonly string[]).includes(v.id));
  const radii = BUTTON_RADII.filter((r) => (OVERRIDE_BUTTON_RADII as readonly string[]).includes(r.id) && (!widgetScope || r.id !== "pill"));
  const sample = glassSurfaceStyle(tokens, scope === "all" ? "links" : (scope as Exclude<ThemeScope, "all">), { links: true, presence: true, board: true, booking: true });

  const lensTokens = [tokens, ...GLASS_RECIPES.map((g) => ({ ...tokens, ...g.patch }))];
  return (
    <section className="space-y-4">
      <LiquidGlassFilters tokens={lensTokens} />
      {scope !== "all" && (
        <div className="flex flex-wrap items-center gap-2">
          {unique ? (
            <>
              <span className="text-xs font-medium text-primary">{t("studio.themeBar.unique")}</span>
              <Button type="button" size="sm" variant="outline" onClick={reset}>{t("studio.themeBar.reset")}</Button>
            </>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("studio.themeBar.followsDefault")}</span>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="input-label">{t("studio.themeBar.shape")}</p>
          <CustomizeButton open={custom} onToggle={() => setPref("buttonsCustom", !custom)} label={t("studio.themeBar.shapeCustomize")} controls="button-advanced" />
        </div>
        {!custom && (
          <div className="flex flex-wrap gap-1.5">
            {SHAPE_PRESETS.filter((sp) => sp.glassStyle === "solid" && (!widgetScope || sp.buttonRadius !== "pill")).map((sp) => (
              <StudioChip
                key={sp.id}
                active={design.buttonVariant === sp.buttonVariant && design.buttonRadius === sp.buttonRadius && tokens.glassStyle === sp.glassStyle}
                onClick={() => patch({ buttonVariant: sp.buttonVariant, buttonRadius: sp.buttonRadius, glassStyle: sp.glassStyle })}
              >
                {sp.label}
              </StudioChip>
            ))}
          </div>
        )}
        {!custom && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SHAPE_PRESETS.filter((sp) => sp.glassStyle !== "solid" && (!widgetScope || sp.buttonRadius !== "pill")).map((sp) => {
              const active = design.buttonVariant === sp.buttonVariant && design.buttonRadius === sp.buttonRadius && tokens.glassStyle === sp.glassStyle;
              const look = glassSurfaceStyle({ ...tokens, glassStyle: sp.glassStyle }, "links", ALL_TARGETS);
              return (
                <button key={sp.id} type="button" aria-pressed={active}
                  onClick={() => patch({ buttonVariant: sp.buttonVariant, buttonRadius: sp.buttonRadius, glassStyle: sp.glassStyle })}
                  className={`relative overflow-hidden rounded-xl p-2.5 text-left transition-shadow ${active ? "ring-2 ring-primary" : "ring-1 ring-border"}`}>
                  <GlassBackdrop />
                  <span className={`relative block px-3 py-2 text-center text-xs font-medium ${RADIUS_CLASS[sp.buttonRadius ?? "xl"]}`} style={look ?? undefined}>
                    <span className={sp.glassStyle === "frosted-light" || sp.glassStyle === "prism" ? "text-foreground" : "text-primary-foreground"}>{sp.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {custom && (
        <div id="button-advanced" className="space-y-4 rounded-2xl border border-border p-3 sm:p-4">
          <Group label={t("studio.themeBar.style")}>
            {variants.map((v) => <StudioChip key={v.id} active={design.buttonVariant === v.id} onClick={() => patch({ buttonVariant: v.id as ScopeOverride["buttonVariant"] })}>{v.label}</StudioChip>)}
          </Group>
          <Group label={t("studio.themeBar.radius")}>
            {radii.map((r) => <StudioChip key={r.id} active={design.buttonRadius === r.id} onClick={() => patch({ buttonRadius: r.id as ScopeOverride["buttonRadius"] })}>{r.label}</StudioChip>)}
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="input-label block">{t("studio.themeBar.color")}</span>
              <input type="color" className="h-9 w-full rounded-md border border-border bg-background" value={design.buttonColor ?? "#000000"} onChange={(e) => patch({ buttonColor: e.target.value })} />
            </label>
            <div className="space-y-1 text-xs">
              <label className="flex items-center justify-between gap-2">
                <span className="input-label block">{t("studio.themeBar.border")}</span>
                <Switch
                  checked={Boolean(design.buttonBorderColor)}
                  onCheckedChange={(on) => patch({ buttonBorderColor: on ? (design.buttonColor ?? "#000000") : null })}
                  aria-label={t("studio.themeBar.borderToggle")}
                />
              </label>
              {design.buttonBorderColor ? (
                <input type="color" aria-label={t("studio.themeBar.borderColor")} className="h-9 w-full rounded-md border border-border bg-background" value={design.buttonBorderColor} onChange={(e) => patch({ buttonBorderColor: e.target.value })} />
              ) : (
                <p className="text-[11px] text-muted-foreground">{t("studio.themeBar.borderOff")}</p>
              )}
            </div>
          </div>
          {scope === "all" && <>
            <Group label={t("studio.themeBar.linkDisplay")}>
              {([["bar", t("studio.themeBar.shapeBar")], ["icon", t("studio.themeBar.shapeIcon")], ["both", t("studio.themeBar.shapeBoth")]] as const).map(([id, label]) => <StudioChip key={id} active={prefs.buttonShape === id} onClick={() => setPref("buttonShape", id)}>{label}</StudioChip>)}
            </Group>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs"><span className="input-label">{t("studio.themeBar.size")}</span><Select value={prefs.buttonSize} onValueChange={(value) => setPref("buttonSize", value as ProfileDisplayPrefs["buttonSize"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUTTON_SIZES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></label>
              <label className="space-y-1 text-xs"><span className="input-label">{t("studio.themeBar.motion")}</span><Select value={prefs.buttonEffect} onValueChange={(value) => setPref("buttonEffect", value as ProfileDisplayPrefs["buttonEffect"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUTTON_EFFECTS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></label>
            </div>
          </>}

          <div className="space-y-3 border-t border-border pt-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              {t("studio.themeBar.glass")}
              <Switch checked={glassOn} onCheckedChange={(v) => patch({ glassStyle: v ? "frosted-light" : "solid" })} />
            </label>
            {glassOn && <>
              <Group label={t("studio.themeBar.recipe")}>
                {GLASS_RECIPES.map((g) => <StudioChip key={g.id} active={(Object.keys(g.patch) as (keyof ScopeOverride)[]).every((k) => tokens[k as keyof typeof tokens] === g.patch[k])} onClick={() => patch(g.patch)}>{g.label}</StudioChip>)}
              </Group>
              <Group label={t("studio.themeBar.glassType")}>
                {GLASS_TYPES.map((g) => <StudioChip key={g.id} active={tokens.glassStyle === g.id} onClick={() => patch({ glassStyle: g.id })}>{g.label}</StudioChip>)}
              </Group>
              <div className="relative overflow-hidden rounded-2xl p-5">
                <GlassBackdrop detailed />
                <div className="relative space-y-2.5">
                  {[t("studio.themeBar.sampleSite"), t("studio.themeBar.sampleBook")].map((label) => (
                    <div key={label} className={`px-4 py-3 text-center text-sm font-medium ${RADIUS_CLASS[design.buttonRadius ?? "xl"]} ${tokens.glassStyle === "frosted-light" || tokens.glassStyle === "prism" ? "text-foreground" : "text-primary-foreground"}`} style={sample ?? undefined}>{label}</div>
                  ))}
                </div>
                <p className="relative mt-3 text-center text-[11px] text-primary-foreground/80">{t("studio.themeBar.hoverHint")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <GlassSlider label={t("studio.themeBar.opacity")} unit="%" min={5} max={50} value={tokens.glassOpacity} onChange={(v) => patch({ glassOpacity: v })} />
                <GlassSlider label={t("studio.themeBar.blur")} unit="px" min={4} max={32} value={tokens.glassBlur} onChange={(v) => patch({ glassBlur: v })} />
                <GlassSlider label={t("studio.themeBar.saturation")} unit="%" min={100} max={200} value={tokens.glassSaturation} onChange={(v) => patch({ glassSaturation: v })} />
                <GlassSlider label={t("studio.themeBar.refraction")} unit="" min={0} max={100} value={tokens.glassRefraction} onChange={(v) => patch({ glassRefraction: v })} />
                <GlassSlider label={t("studio.themeBar.aberration")} unit="" min={0} max={50} value={tokens.glassAberration} format={(v) => (v / 10).toFixed(1)} onChange={(v) => patch({ glassAberration: v })} />
                <GlassSlider label={t("studio.themeBar.specular")} unit="%" min={0} max={100} value={tokens.glassSpecular} onChange={(v) => patch({ glassSpecular: v })} />
              </div>
              <p className="text-[11px] text-muted-foreground">{t("studio.themeBar.browserNote")}</p>
              <Group label={t("studio.themeBar.edge")}>
                {BORDERS.map((b) => <StudioChip key={b.id} active={tokens.glassBorder === b.id} onClick={() => patch({ glassBorder: b.id })}>{t(`studio.themeBar.border.${b.id}`)}</StudioChip>)}
              </Group>
            </>}
          </div>
        </div>
      )}

      {showTypography && (
        <div className="space-y-3">
          <Group label={t("studio.themeBar.typography")}>
            {FONT_PAIRINGS.map((f) => <StudioChip key={f.id} active={design.fontPairing === f.id} onClick={() => patch({ fontPairing: f.id as ScopeOverride["fontPairing"] })}>{f.label}</StudioChip>)}
          </Group>
          <div className="flex items-end gap-2 text-xs">
            <label className="flex-1 space-y-1">
              <span className="input-label block">{t("studio.themeBar.textColor")}</span>
              <input type="color" className="h-9 w-full rounded-md border border-border bg-background" value={design.buttonTextColor ?? "#ffffff"} onChange={(e) => patch({ buttonTextColor: e.target.value })} />
            </label>
            {design.buttonTextColor && (
              <Button type="button" size="sm" variant="ghost" onClick={() => patch({ buttonTextColor: null })}>{t("studio.themeBar.auto")}</Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const ALL_TARGETS: GlassTargets = { links: true, presence: true, board: true, booking: true };
const RADIUS_CLASS: Record<string, string> = { pill: "rounded-full", xl: "rounded-2xl", rounded: "rounded-xl", soft: "rounded-lg", sharp: "rounded-none" };

/** Vivid, detailed backdrop so blur, saturation and refraction are visible. */
function GlassBackdrop({ detailed = false }: { detailed?: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,var(--primary),var(--accent))]">
      <div className="absolute -left-4 top-1 h-16 w-16 rounded-full bg-primary-foreground/70" />
      <div className="absolute right-3 bottom-0 h-12 w-24 rotate-12 rounded-lg bg-accent-foreground/60" />
      {detailed && <>
        <div className="absolute left-1/3 top-1/3 h-20 w-20 rounded-full bg-[conic-gradient(var(--primary),var(--accent),var(--primary-foreground),var(--primary))]" />
        <div className="absolute inset-x-0 top-1/2 text-center text-4xl font-black tracking-tight text-primary-foreground/60">ROUT</div>
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_14px,color-mix(in_oklab,var(--primary-foreground)_25%,transparent)_14px_16px)]" />
      </>}
    </div>
  );
}

function GlassSlider({ label, unit, min, max, value, onChange, format }: { label: string; unit: string; min: number; max: number; value: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="space-y-2">
      <p className="input-label">{label} ({format ? format(value) : value}{unit})</p>
      <Slider min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onChange(v ?? value)} />
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="input-label">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
