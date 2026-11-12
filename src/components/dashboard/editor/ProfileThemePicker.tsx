import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ScopedThemeBar, ThemeScopeSelect } from "@/components/dashboard/editor/ScopedThemeBar";
import type { ThemeScope } from "@/lib/theme-engine";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AvatarFramePicker } from "@/components/studio/AvatarFramePicker";
import { ProPill } from "@/components/studio/ProPill";
import { AvatarDecorationPicker } from "@/components/studio/AvatarDecorationPicker";
import { StatusDesignSettings } from "@/components/dashboard/editor/StatusSettings";
import { FaviconUploader } from "@/components/studio/FaviconUploader";
import { VisitEffectPicker } from "@/components/studio/VisitEffectPicker";
import {
  CustomizeButton,
  DesignButtonsTypographySection,
  DesignFooterSection,
  DesignPresetSection,
  DesignWallpaperSection,
} from "@/components/dashboard/DesignTabEditor";
import { avatarFrameLabel } from "@/lib/avatar-frames";
import { cn } from "@/lib/utils";
import { StudioSectionIcon } from "@/components/studio/StudioSectionIcon";
import {
  AVATAR_FRAMES,
  AVATAR_SHAPES,
  BACKGROUND_STYLES,
  BANNER_DIRECTIONS,
  BANNER_STYLES,
  NAME_ACCENTS,
  TYPOGRAPHY_STYLES,
  type ProfileDisplayPrefs,
} from "@/lib/profile-display";
import { CARD_STYLES, themeOf } from "@/lib/profile";

const AVATAR_SHAPE_LABELS: Record<string, string> = { circle: "Rond", rounded: "Afgerond", squircle: "Squircle", hexagon: "Zeshoek" };

interface ProfileThemePickerProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  tagline: string;
  onTaglineChange: (value: string) => void;
  avatarUrl: string;
  onAvatarUrlChange: (value: string) => void;
  faviconUrl: string;
  onFaviconUrlChange: (value: string) => void;
  theme: string;
  onThemeChange: (value: string) => void;
  cardStyle: string;
  onCardStyleChange: (value: string) => void;
  prefs: ProfileDisplayPrefs;
  setPref: <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;
  verified: boolean;
  /** Profielblokken: bepalen welke onderdelen apart te stijlen zijn. */
  blocks?: readonly { kind: string }[];
}

/**
 * Uiterlijk van het profiel: avatar/frame, presets, kleuren, typografie en
 * achtergrond/visuele effecten. Dekt volledig het tabblad "Design & styling".
 */
export function ProfileThemePicker({
  displayName,
  onDisplayNameChange,
  tagline,
  onTaglineChange,
  avatarUrl,
  onAvatarUrlChange,
  faviconUrl,
  onFaviconUrlChange,
  theme,
  onThemeChange,
  cardStyle,
  onCardStyleChange,
  prefs,
  setPref,
  verified,
  blocks = [],
}: ProfileThemePickerProps) {
  const { locale } = useI18n();
  const componentsTitle = { nl: "Componenten & Typografie", en: "Components & Typography", fr: "Composants & Typographie", de: "Komponenten & Typografie" }[locale];
  const [scope, setScope] = useState<ThemeScope>("all");
  const has = (...kinds: string[]) => blocks.some((b) => kinds.includes(b.kind));
  const allowedScopes: ThemeScope[] = [
    "all", "links", "widgets", "socials",
    ...(has("booking", "booking_request", "calendly") ? (["booking"] as const) : []),
    ...(prefs.guestbookEnabled || has("widget:guestbook") ? (["board"] as const) : []),
    ...(prefs.presence !== "none" || has("live", "spotify") ? (["presence"] as const) : []),
    ...(prefs.questionsEnabled || has("widget:questions") ? (["questions"] as const) : []),
  ];
  const activeScope = allowedScopes.includes(scope) ? scope : "all";
  // AVATAR_FRAMES is currently unused directly here (delegated to AvatarFramePicker)
  // but kept imported for parity with legacy usage / future presets.
  void AVATAR_FRAMES;
  return (
    <>
      {/* 1 — Avatar, header & kaders */}
      <AccordionItem
        value="avatar_header"
        className="rounded-2xl border border-border bg-card px-4 sm:px-5"
      >
        <AccordionTrigger className="hover:no-underline">
          <span className="flex flex-1 items-center justify-between gap-3 pr-2">
            <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="avatar" />Avatar, Header &amp; Frames</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {avatarFrameLabel(prefs.avatarFrame)}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-5">
          <div className="space-y-2">
            <p className="input-label">Avatarvorm</p>
            <div className="grid grid-cols-4 gap-2">
              {AVATAR_SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => setPref("avatarShape", shape.id)}
                  aria-pressed={prefs.avatarShape === shape.id}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
                    prefs.avatarShape === shape.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                  )}
                >
                  {AVATAR_SHAPE_LABELS[shape.id]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="input-label flex items-center gap-1.5">Avatarkader / rand (24 presets) <ProPill /></p>
            <AvatarFramePicker
              value={prefs.avatarFrame}
              onChange={(f) => setPref("avatarFrame", f)}
              avatarUrl={avatarUrl}
              theme={themeOf(theme)}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="input-label">Avatardecoratie &amp; status</p>
            <p className="text-xs text-muted-foreground">
              Oortjes, halo, koptelefoon &hellip; bovenop je avatar.
            </p>
            <AvatarDecorationPicker
              value={prefs.avatarDecoration}
              onChange={(d) => setPref("avatarDecoration", d)}
              avatarUrl={avatarUrl}
              frame={prefs.avatarFrame}
              theme={themeOf(theme)}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="input-label">Naamaccent</p>
            <div className="flex flex-wrap gap-2">
              {NAME_ACCENTS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPref("nameAccent", o.id)}
                  className={cn(
                    "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                    prefs.nameAccent === o.id ? "border-primary/50 bg-primary/10" : "border-border",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <StatusDesignSettings prefs={prefs} setPref={setPref} avatarUrl={avatarUrl} theme={themeOf(theme)} />

          <div className="space-y-2 border-t border-border pt-4">
            <p className="input-label">Favicon (optioneel)</p>
            <FaviconUploader value={faviconUrl} onChange={onFaviconUrlChange} />
          </div>
        </AccordionContent>
      </AccordionItem>


      {/* 3 — Knoppen & typografie */}
      <AccordionItem
        value="buttons_typography"
        className="rounded-2xl border border-border bg-card px-4 sm:px-5"
      >
        <div className="flex flex-wrap items-center gap-2" data-tour="studio-button-style"><AccordionTrigger className="min-w-0 flex-1 hover:no-underline"><span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="typography" /><span>{componentsTitle}</span></span></AccordionTrigger><ThemeScopeSelect scope={activeScope} onChange={setScope} allowedScopes={allowedScopes} /></div>
        <AccordionContent className="space-y-4 pb-5">
          <ScopedThemeBar prefs={prefs} setPref={setPref} scope={activeScope} showTypography={activeScope !== "all"} />
          {activeScope === "all" && <>
          <div className="flex min-w-0 items-center gap-2 pt-2">
            <p className="input-label flex items-center gap-1.5">Typografie <ProPill /></p>
            <CustomizeButton open={prefs.typographyCustom} onToggle={() => setPref("typographyCustom", !prefs.typographyCustom)} label="Typografie aanpassen" controls="type-advanced" />
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPOGRAPHY_STYLES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPref("typography", t.id)}
                className={cn(
                  "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                  prefs.typography === t.id ? "border-primary/50 bg-primary/10" : "border-border",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="w-full">
            <DesignButtonsTypographySection prefs={prefs} setPref={setPref} theme={theme} inlineControls section="typography" />
          </div>
          </>}
          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">&ldquo;Made with ROUT&rdquo;-voetnoot</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {verified
                  ? "Als geverifieerd lid is je profiel standaard white-label."
                  : "Gratis profielen tonen de subtiele ROUT-voetnoot."}
              </p>
            </div>
            <Switch
              aria-label="Made with ROUT tonen"
              disabled={!verified}
              checked={verified ? (prefs.showWatermark ?? false) : true}
              onCheckedChange={(v) => setPref("showWatermark", v)}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* 4 — Footer & branding */}
      <AccordionItem
        value="footer_branding"
        className="rounded-2xl border border-border bg-card px-4 sm:px-5"
      >
        <AccordionTrigger className="hover:no-underline">
          <span className="flex flex-1 items-center justify-between gap-3 pr-2">
            <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="footer" />Footer &amp; Branding</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <DesignFooterSection
            prefs={prefs}
            setPref={setPref}
            theme={theme}
            verified={verified}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 5 — Achtergrond & visual FX */}
      <AccordionItem
        value="background_effects"
        className="rounded-2xl border border-border bg-card px-4 sm:px-5"
      >
        <AccordionTrigger className="hover:no-underline">
          <span className="flex flex-1 items-center justify-between gap-3 pr-2">
            <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="background" />Achtergrond &amp; Visual FX</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {BACKGROUND_STYLES.find((o) => o.id === prefs.backgroundStyle)?.label ??
                prefs.backgroundStyle}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-5">
          <DesignPresetSection
            prefs={prefs}
            setPref={setPref}
            theme={theme}
            setTheme={onThemeChange}
            setCardStyle={onCardStyleChange}
          />
          <DesignWallpaperSection
            prefs={prefs}
            setPref={setPref}
            theme={theme}
          />
          <VisitEffectPicker
            value={prefs.visitEffect}
            onChange={(id) => setPref("visitEffect", id)}
            custom={prefs.visitEffectCustom}
            onCustomChange={(next) => setPref("visitEffectCustom", next)}
          />
          <p className="input-label pt-2">Banner</p>
          <div className="flex flex-wrap gap-2">
            {BANNER_STYLES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setPref("bannerStyle", o.id)}
                className={cn(
                  "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                  prefs.bannerStyle === o.id ? "border-primary/50 bg-primary/10" : "border-border",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {prefs.bannerStyle === "gradient" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="input-label">Van</p>
                  <input
                    type="color"
                    aria-label="Bannerkleur van"
                    value={prefs.bannerFrom ?? "#1a1a1a"}
                    onChange={(e) => setPref("bannerFrom", e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-border bg-transparent p-1"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="input-label">Naar</p>
                  <input
                    type="color"
                    aria-label="Bannerkleur naar"
                    value={prefs.bannerTo ?? "#c9a84c"}
                    onChange={(e) => setPref("bannerTo", e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-border bg-transparent p-1"
                  />
                </div>
              </div>
              <p className="input-label pt-2">Richting van het verloop</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BANNER_DIRECTIONS.map((d) => {
                  const from = prefs.bannerFrom ?? "#1a1a1a";
                  const to = prefs.bannerTo ?? "#c9a84c";
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={prefs.bannerDirection === d.id}
                      onClick={() => setPref("bannerDirection", d.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border p-2 text-left text-[11px] font-medium transition-colors",
                        prefs.bannerDirection === d.id
                          ? "border-primary/50 bg-primary/10"
                          : "border-border",
                      )}
                    >
                      <span
                        aria-hidden
                        className="h-7 w-10 shrink-0 rounded-md border border-border"
                        style={{
                          backgroundImage:
                            d.id === "radial"
                              ? `radial-gradient(circle at 50% 50%, ${from}, ${to})`
                              : `linear-gradient(${d.id}, ${from}, ${to})`,
                        }}
                      />
                      <span className="truncate">{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {prefs.bannerStyle === "image" && (
            <div className="space-y-1.5">
              <p className="input-label">Afbeeldings-URL (https)</p>
              <Input
                value={prefs.bannerImageUrl ?? ""}
                onChange={(e) => setPref("bannerImageUrl", e.target.value || null)}
                placeholder="https://…/banner.jpg"
                spellCheck={false}
                className="h-10 text-xs"
              />
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
