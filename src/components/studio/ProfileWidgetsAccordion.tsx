import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { StudioToggleCard } from "./StudioToggleCard";
import { QuestionsInboxAccordion } from "./QuestionsInboxAccordion";
import { GuestbookAccordion } from "./GuestbookAccordion";
import { AddComponentModal, type WidgetId } from "./AddComponentModal";
import { BadgesPanel } from "@/components/dashboard/BadgesPanel";
import { BadgeActivityPanel } from "@/components/dashboard/BadgeActivityPanel";
import { normalizeDesignLayers, serializeDesignLayers } from "@/lib/design-layers";
import { isProfileSectionKind, PROFILE_SECTION_LABELS } from "@/lib/profile-section-blocks";
import type { ProfileBlock } from "@/lib/profile";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import type { QaSpace } from "@/components/qa/useQaPublic";
import { isStudioWidget } from "@/lib/studio-widget-rules";
import { newBlockId } from "@/lib/profile";
import { applySharedPlace, isVisualWidget, isWidgetReady, parseWidgetConfig, serializeWidgetConfig, sharedWidgetPlace, LOCATION_WIDGETS, type VisualWidgetKind } from "@/lib/profile-widgets";
import { VisualWidgetCatalog, VISUAL_WIDGET_ICON } from "./VisualWidgetCatalog";
import { VisualWidgetSettings } from "./VisualWidgetSettings";
import { ChevronDown, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";

type SetPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;

/** Blokken die als widget op het profiel liggen en een afmeting krijgen. */

interface Props {
  blocks: ProfileBlock[];
  onOpenBlockChange: (id: string | null) => void;
  onAddKind: (kind: string, value?: string) => void;
  /** Direct block list access for the visual widgets (add, configure, size, remove). */
  onBlocksChange?: Dispatch<SetStateAction<ProfileBlock[]>>;
  /** City from the profile location badge; location widgets default to it. */
  profileCity?: string | null;
  /** Zet een profielwidget aan vanuit de catalogus. */
  onWidget?: (id: WidgetId) => void;
  /** Zorgt dat een sectieblok bestaat zonder de editor te openen. */
  ensureBlock: (kind: string) => void;
  handle?: string;
  designLayers?: string;
  onDesignLayersChange?: (value: string) => void;
  isWorkspace: boolean;
  qaSpace: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
  prefs: ProfileDisplayPrefs;
  onPref: SetPref;
}

/**
 * 🧩 Widgets — eigen map naast Links & componenten.
 *
 * Anonieme Inbox, Prikbord en Badges & diploma's staan hier altijd klaar met
 * een schakelaar; extra widgets voeg je toe via de catalogus en krijgen een
 * instelbare breedte en hoogte.
 */
export function ProfileWidgetsAccordion({
  blocks,
  onOpenBlockChange,
  onAddKind,
  onWidget,
  ensureBlock,
  handle,
  designLayers,
  onDesignLayersChange,
  isWorkspace,
  qaSpace,
  displayName,
  avatarUrl,
  prefs,
  onPref,
  onBlocksChange,
  profileCity,
}: Props) {
  const { t } = useTranslation();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [openWidget, setOpenWidget] = useState<string | null>(null);
  const visualBlocks = blocks.filter((b) => isVisualWidget(b.kind));
  const sharedPlace = sharedWidgetPlace(blocks);
  const patchBlock = (id: string, next: Partial<ProfileBlock>) => onBlocksChange?.((list) => list.map((b) => (b.id === id ? { ...b, ...next } : b)));
  const addVisual = (kind: VisualWidgetKind) => {
    if (!onBlocksChange) return;
    const id = newBlockId();
    // Location widgets start with the shared city, so it is entered only once.
    const value = (LOCATION_WIDGETS as readonly string[]).includes(kind) && sharedPlace ? serializeWidgetConfig({ place: sharedPlace }) : "{}";
    const size = kind === "wg_weather" || kind === "wg_clock" || kind === "wg_birthday" ? "small" as const : undefined;
    onBlocksChange((list) => [...list, { id, kind, label: t(`studio.vw.kind.${kind}`), value, ...(size ? { size } : {}) }]);
    setOpenWidget(id);
  };

  const sizedBlocks = blocks.filter(
    (b) => isStudioWidget(b.kind),
  );
  const fixedActive = [
    !isWorkspace && prefs.questionsEnabled && prefs.qaOnHub,
    prefs.guestbookEnabled,
    prefs.badgeShowcaseVisible,
  ].filter(Boolean).length;
  const active = sizedBlocks.filter((b) => !b.hidden).length + fixedActive;

  const blockLabel = (b: ProfileBlock) =>
    b.label || (isProfileSectionKind(b.kind) ? PROFILE_SECTION_LABELS[b.kind] : b.kind.replace("widget:", ""));

  return (
    <AccordionItem value="widgets" className="acrylic-card px-4 sm:px-5">
      <AccordionTrigger className="hover:no-underline">
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium">
            <StudioSectionIcon kind="content" />{t("studio.widgets.title")}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {t("studio.widgets.visible", { count: active })}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">

        {/* Vaste widgets: altijd zichtbaar, direct aan/uit — nooit achter een modal. */}
        <div className="space-y-3">
          {!isWorkspace && (
            <QuestionsInboxAccordion
              space={qaSpace}
              handle={handle ?? ""}
              displayName={displayName}
              avatarUrl={avatarUrl}
              prefs={prefs}
              onPref={(key, value) => {
                onPref(key, value);
                if (key === "qaOnHub" && value === true) ensureBlock("widget:questions");
              }}
            />
          )}
          <GuestbookAccordion
            unframed
            enabled={prefs.guestbookEnabled}
            onEnabledChange={(v) => {
              onPref("guestbookEnabled", v);
              if (v) ensureBlock("widget:guestbook");
            }}
          />
          <StudioToggleCard
            unframed
            icon={<StudioSectionIcon kind="badges" />}
            title={t("studio.badgesFolder").replace(/^\p{Extended_Pictographic}\s*/u, "")}
            subtitle={t("studio.editor.badgesHelp")}
            checked={prefs.badgeShowcaseVisible}
            onCheckedChange={(v) => {
              onPref("badgeShowcaseVisible", v);
              if (v) ensureBlock("widget:badges");
            }}
          >
            <BadgesPanel />
            <BadgeActivityPanel />
          </StudioToggleCard>
        </div>

        {/* Visuele widgets: eigen catalogus, instellingen en tegelformaat. */}
        {onBlocksChange && (
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("studio.vw.section")}</p>
              <p className="text-xs text-muted-foreground">{t("studio.vw.sectionHelp")}</p>
            </div>
            {visualBlocks.length > 0 && (
              <ul className="space-y-2">
                {visualBlocks.map((b) => {
                  const kind = b.kind as VisualWidgetKind;
                  const Icon = VISUAL_WIDGET_ICON[kind];
                  const open = openWidget === b.id;
                  const ready = isWidgetReady(kind, parseWidgetConfig(b.value));
                  return (
                    <li key={b.id} className={cn("rounded-xl border border-border bg-background p-3", b.hidden && "opacity-60")}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40"><Icon className="h-4 w-4" aria-hidden /></span>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenWidget(open ? null : b.id)} aria-expanded={open}>
                          <span className="block truncate text-sm font-medium">{b.label || t(`studio.vw.kind.${kind}`)}</span>
                          <span className={cn("block truncate text-[11px]", ready ? "text-muted-foreground" : "text-destructive")}>{ready ? t(`studio.vw.kind.${kind}`) : t("studio.vw.needsSetup")}</span>
                        </button>
                        <Switch checked={!b.hidden} onCheckedChange={(on) => patchBlock(b.id, { hidden: !on })} aria-label={b.hidden ? t("studio.links.show") : t("studio.links.hide")} className="shrink-0" />
                        <button type="button" aria-label={t("studio.links.settings")} onClick={() => setOpenWidget(open ? null : b.id)} className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted">
                          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                        </button>
                      </div>
                      {open && (
                        <div className="mt-3 space-y-3 border-t border-border pt-3">
                          <VisualWidgetSettings
                            kind={kind}
                            label={b.label}
                            value={b.value}
                            size={b.size}
                            onChange={(value) => patchBlock(b.id, { value })}
                            onTitle={(label) => patchBlock(b.id, { label })}
                            onSize={(size) => patchBlock(b.id, { size })}
                            sharedPlace={sharedPlace}
                            profileCity={profileCity ?? null}
                            onPlace={(place) => onBlocksChange?.((list) => applySharedPlace(list, b.id, place))}
                          />
                          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => { onBlocksChange?.((list) => list.filter((x) => x.id !== b.id)); setOpenWidget(null); }}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("studio.links.delete")}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button type="button" className="min-h-12 w-full gap-2 text-sm" onClick={() => setCatalogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> {t("studio.vw.add")}
            </Button>
            <VisualWidgetCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} onPick={addVisual} />
          </div>
        )}

        {/* Afmetingen per widgetblok */}
        {sizedBlocks.length > 0 && (
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("studio.widgets.sizes")}</p>
            {sizedBlocks.map((b) => {
              const layers = normalizeDesignLayers(designLayers);
              const tile = layers.blockStyles[b.id];
              const patch = (change: { width?: 1 | 2; height?: "auto" | "medium" | "tall" }) =>
                onDesignLayersChange?.(
                  serializeDesignLayers({
                    ...layers,
                    blockStyles: {
                      ...layers.blockStyles,
                      [b.id]: { ...(tile ?? { bg: null, text: null, radius: null, shadow: "none" as const }), ...change },
                    },
                  }),
                );
              return (
                <div key={b.id} className="space-y-2 border-b border-border pb-3 last:border-b-0">
                  <p className="break-words text-sm font-medium">{blockLabel(b)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={String(tile?.width ?? 2)} onValueChange={(v) => patch({ width: v === "1" ? 1 : 2 })}>
                      <SelectTrigger aria-label={`${blockLabel(b)} ${t("studio.widgets.width")}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t("studio.widgets.widthHalf")}</SelectItem>
                        <SelectItem value="2">{t("studio.widgets.widthFull")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={tile?.height ?? "auto"} onValueChange={(v) => patch({ height: v as "auto" | "medium" | "tall" })}>
                      <SelectTrigger aria-label={`${blockLabel(b)} ${t("studio.widgets.height")}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t("studio.widgets.heightAuto")}</SelectItem>
                        <SelectItem value="medium">{t("studio.widgets.heightMedium")}</SelectItem>
                        <SelectItem value="tall">{t("studio.widgets.heightTall")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onOpenBlockChange(b.id)}>
                    {t("studio.widgets.edit")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <Button type="button" variant="outline" className="min-h-12 w-full gap-2 text-sm" onClick={() => setLibraryOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> {t("studio.widgets.add")}
        </Button>
        <AddComponentModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onAdd={onAddKind}
          handle={handle}
          onWidget={onWidget}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
