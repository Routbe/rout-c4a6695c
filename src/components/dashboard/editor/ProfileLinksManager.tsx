import { useI18n } from "@/lib/i18n";
import { SocialBlockSettings } from "@/components/studio/SocialBlockSettings";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  RotateCcw,
  Award,
  MessageSquare,
  Users,
  ChevronDown,
  GripVertical,
  ImagePlus,
  Pin,

  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { LiveBlockSettings } from "@/components/studio/LiveBlockSettings";
import { YouTubeStudioCard } from "@/components/studio/YouTubeStudioCard";
import { FeedbackPicker } from "@/components/studio/FeedbackPanel";
import { Switch } from "@/components/ui/switch";
import { SocialPlatformIcon } from "@/lib/social-icons";
import { SocialHandleInput } from "@/components/SocialHandleInput";
import { isHandleBlock } from "@/lib/social-handles";
import { cn } from "@/lib/utils";
import { inputHint } from "@/lib/profile-editor-utils";
import {
  BLOCK_KINDS,
  blockHref,
  brandOf,
  isPromoBlock,
  sanitizeUrl,
  PROMO_BADGE_PRESETS,
  PROMO_COPY_PRESETS,
  fromLocalDateTimeInput,
  isValidScheduleWindow,
  toLocalDateTimeInput,
  BLOCK_SIZES,
  isArchivedBlock,
  restoreArchivedBlock,
  effectiveLinkDisplay,
  isPlainLinkKind,
  countLogoLinks,
  logoBarStage,
  type LinkDisplay,
  type ProfileLinkMode,
  type ProfileBlock,
} from "@/lib/profile";
import { applySharedPlace, isVisualWidget, sharedWidgetPlace, type VisualWidgetKind } from "@/lib/profile-widgets";
import { VisualWidgetSettings } from "@/components/studio/VisualWidgetSettings";
import { isProfileSectionKind } from "@/lib/profile-section-blocks";
import { BlockRulesPopover } from "@/components/studio/BlockRulesPopover";
import { BookingBlockSettings } from "@/components/dashboard/BookingBlockSettings";
import { GalleryBlockSettings } from "@/components/dashboard/GalleryBlockSettings";
import { SocialGridBlockSettings } from "@/components/dashboard/SocialGridBlockSettings";
import { SocialFeedBlockSettings } from "@/components/dashboard/SocialFeedBlockSettings";
import { MediaEmbedBlockSettings } from "@/components/dashboard/MediaEmbedBlockSettings";
import { AudioBlockSettings } from "@/components/dashboard/AudioBlockSettings";
import { ContactFormBlockSettings } from "@/components/dashboard/ContactFormBlockSettings";
import { EventListBlockSettings } from "@/components/dashboard/EventListBlockSettings";
import {
  FaqBlockSettings,
  MapBlockSettings,
  PollBlockSettings,
} from "@/components/dashboard/InteractionBlockSettings";
import { VCardBlockSettings } from "@/components/dashboard/VCardBlockSettings";
import { NewsletterBlockSettings } from "@/components/dashboard/NewsletterBlockSettings";

interface ProfileLinksManagerProps {
  blocks: ProfileBlock[];
  onBlocksChange: Dispatch<SetStateAction<ProfileBlock[]>>;
  openBlock: string | null;
  onOpenBlockChange: (id: string | null) => void;
  onOpenAddDrawer: () => void;
  /** Profile-wide link display, the default for links without their own choice. */
  linkMode?: ProfileLinkMode;
  /** City from the profile location badge, offered to location widgets. */
  profileCity?: string | null;
}

/**
 * Beheer van de link-/componentenlijst: toevoegen, in-/uitschakelen, per-blok
 * instellingen en herordenen via drag-and-drop of pijltjesknoppen.
 */
export function ProfileLinksManager({
  blocks,
  onBlocksChange,
  openBlock,
  onOpenBlockChange,
  onOpenAddDrawer,
  linkMode = "rows",
  profileCity = null,
}: ProfileLinksManagerProps) {
  const { t } = useI18n();
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Active list or the archive (switched off / past end date). */
  const [view, setView] = useState<"active" | "archive">("active");
  const now = Date.now();
  const archivedCount = blocks.filter((b) => isArchivedBlock(b, now)).length;
  const shown = blocks.filter((b) => isArchivedBlock(b, now) === (view === "archive"));
  const logoCount = countLogoLinks(blocks, linkMode);
  const logoStage = logoBarStage(logoCount);

  const patch = (id: string, next: Partial<ProfileBlock>) =>
    onBlocksChange((b) => b.map((x) => (x.id === id ? { ...x, ...next } : x)));

  /** Schedule inputs: unreadable dates are ignored instead of crashing or saving garbage. */
  const setScheduleField = (block: ProfileBlock, field: "startsAt" | "expiresAt", value: string) => {
    const iso = fromLocalDateTimeInput(value);
    if (iso === null) return;
    patch(block.id, { [field]: iso });
  };

  /** Zet het blok bovenaan (of maakt het weer los). */
  const togglePin = (id: string) =>
    onBlocksChange((b) => {
      const target = b.find((x) => x.id === id);
      if (!target) return b;
      const next = b.map((x) => (x.id === id ? { ...x, pinned: !target.pinned } : x));
      if (target.pinned) return next;
      const moved = next.find((x) => x.id === id);
      if (!moved) return next;
      return [moved, ...next.filter((x) => x.id !== id)];
    });

  /** Kleine miniatuur (max ~300 KB) als data-URL bij het blok bewaren. */
  const pickThumbnail = (id: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 300_000) {
        toast.error(t("studio.links.smallImage"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => patch(id, { thumbnailUrl: String(reader.result) });
      reader.readAsDataURL(file);
    };
    input.click();
  };

  /** Every reorder gets a floating Undo toast, one click back. */
  const reorderWithUndo = (mutate: (list: ProfileBlock[]) => ProfileBlock[]) => {
    onBlocksChange((b) => {
      const next = mutate(b);
      if (next === b) return b;
      const before = b;
      toast(t("studio.links.order"), {
        action: { label: t("studio.links.undo"), onClick: () => onBlocksChange(before) },
      });
      return next;
    });
  };

  const move = (id: string, delta: number) =>
    reorderWithUndo((b) => {
      const from = b.findIndex((x) => x.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= b.length) return b;
      const next = [...b];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });

  const dropOn = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    setDragging(null);
    setDropTarget(null);
    if (!from || from === targetId) return;
    reorderWithUndo((b) => {
      const next = b.filter((x) => x.id !== from);
      const moved = b.find((x) => x.id === from);
      if (!moved) return b;
      next.splice(
        next.findIndex((x) => x.id === targetId),
        0,
        moved,
      );
      return next;
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t("studio.links.title")}</h2>
        <span className="text-[11px] text-muted-foreground">
          {t("studio.links.visible", { count: blocks.filter((b) => !b.hidden).length })}
        </span>
      </div>


      <div role="tablist" aria-label={t("studio.links.viewLabel")} className="inline-flex rounded-full border border-border bg-muted/40 p-0.5 text-[11px]">
        {(["active", "archive"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition-colors",
              view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {id === "archive" && <Archive className="h-3.5 w-3.5" aria-hidden />}
            {id === "active" ? t("studio.links.viewActive", { count: blocks.length - archivedCount }) : t("studio.links.viewArchive", { count: archivedCount })}
          </button>
        ))}
      </div>

      {view === "active" && logoStage !== "calm" && (
        <p role="status" className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {logoStage === "hint" ? t("studio.logoBar.hint", { count: logoCount }) : t("studio.logoBar.choose", { count: logoCount })}
        </p>
      )}

      {shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          {view === "archive" ? t("studio.links.archiveEmpty") : t("studio.links.empty")}
        </p>
      )}

      <ul className="space-y-2">
        {blocks.map((b, index) => {
          if (isArchivedBlock(b, now) !== (view === "archive")) return null;
          const hint = inputHint(b.kind);
          const open = openBlock === b.id;
          const section = isProfileSectionKind(b.kind);
          const SectionIcon = b.kind === "widget:guestbook" ? MessageSquare : b.kind === "widget:badges" ? Award : Users;
          return (
            <li
              key={b.id}
              draggable
              onDragStart={() => {
                dragId.current = b.id;
                setDragging(b.id);
              }}
              onDragEnd={() => {
                dragId.current = null;
                setDragging(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragId.current && dragId.current !== b.id) setDropTarget(b.id);
              }}
              onDragLeave={() => setDropTarget((t) => (t === b.id ? null : t))}
              onDrop={() => dropOn(b.id)}
              className={cn(
                "relative overflow-hidden rounded-xl border bg-background p-3 transition-all",
                b.hidden ? "border-border opacity-60" : "border-border",
                dragging === b.id && "opacity-40",
                dropTarget === b.id &&
                  "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-primary",
              )}
              style={{ borderLeft: `4px solid ${brandOf(b.kind)}` }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <GripVertical
                  className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                  aria-hidden
                />
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40"
                  style={{ color: brandOf(b.kind) }}
                >
                  {section ? <SectionIcon className="h-4 w-4 text-current" aria-hidden /> : <SocialPlatformIcon
                    source={b.value?.trim() || b.kind}
                    kind={b.kind}
                    iconMode={b.iconMode}
                    className="h-4 w-4 text-current"
                  />}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenBlockChange(open ? null : b.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">{b.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {section ? b.label : b.value ? blockHref(b) : t("studio.links.unfilled")}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={b.pinned ? t("studio.links.unpin") : t("studio.links.pin")}
                  aria-pressed={Boolean(b.pinned)}
                  onClick={() => togglePin(b.id)}
                  className={cn(
                    "shrink-0 rounded-lg p-1 transition-colors hover:bg-muted",
                    b.pinned ? "text-amber-500" : "text-muted-foreground",
                  )}
                >
                  <Pin className="h-4 w-4" />
                </button>
                {view === "archive" && (
                  <button
                    type="button"
                    onClick={() => onBlocksChange((list) => list.map((x) => (x.id === b.id ? restoreArchivedBlock(x) : x)))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("studio.links.restore")}
                  </button>
                )}
                <BlockRulesPopover block={b} onChange={(next) => patch(b.id, next)} />
                <Switch
                  checked={!b.hidden}
                  onCheckedChange={(on) => patch(b.id, { hidden: !on })}
                  aria-label={b.hidden ? t("studio.links.show") : t("studio.links.hide")}
                  className="shrink-0 data-[state=checked]:bg-emerald-500"
                />
                <button
                  type="button"
                  aria-label={t("studio.links.settings")}
                  onClick={() => onOpenBlockChange(open ? null : b.id)}
                  className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                </button>
              </div>

              {open && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {isVisualWidget(b.kind) ? (
                    <VisualWidgetSettings
                      kind={b.kind as VisualWidgetKind}
                      label={b.label}
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                      sharedPlace={sharedWidgetPlace(blocks)}
                      profileCity={profileCity}
                      onPlace={(place) => onBlocksChange((list) => applySharedPlace(list, b.id, place))}
                    />
                  ) : section ? (
                    <>
                      <Input aria-label={t("studio.links.label")} value={b.label} maxLength={100} onChange={(e) => patch(b.id, { label: e.target.value })} />
                      {b.kind === "widget:youtube" && <YouTubeStudioCard />}
                    </>
                  ) : b.kind === "feedback" ? (
                    <FeedbackPicker value={b.value} onChange={value => patch(b.id, { value })} />
                  ) : b.kind === "live" ? (
                    <LiveBlockSettings
                      provider={b.value}
                      stats={b.stats}
                      onStatsChange={(stats) => patch(b.id, { stats })}
                    />
                  ) : b.kind === "media_gallery" ? (
                    <GalleryBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "social_grid" ? (
                    <SocialGridBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "social_feed" ? (
                    <SocialFeedBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "media_embed" ? (
                    <MediaEmbedBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "audio_player" ? (
                    <AudioBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "booking_request" ? (
                    <BookingBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "contact_form" ? (
                    <ContactFormBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "event_list" ? (
                    <EventListBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "live_poll" ? (
                    <PollBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "vcard" ? (
                    <VCardBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "faq_accordion" ? (
                    <FaqBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "map_embed" ? (
                    <MapBlockSettings
                      value={b.value}
                      onChange={(value) => patch(b.id, { value })}
                      onTitle={(label) => patch(b.id, { label })}
                    />
                  ) : b.kind === "newsletter" ? (
                    <>
                      <Input aria-label={t("studio.links.label")} value={b.label} maxLength={100} onChange={(e) => patch(b.id, { label: e.target.value })} />
                      <NewsletterBlockSettings value={b.value} onChange={(value) => patch(b.id, { value })} />
                    </>
                  ) : b.kind === "countdown" ? (
                    <>
                      <Input aria-label={t("studio.links.label")} value={b.label} maxLength={100} onChange={(e) => patch(b.id, { label: e.target.value })} />
                      <Input
                        type="datetime-local"
                        className="input-field h-11 rounded-xl"
                        aria-label={t("studio.countdown.target")}
                        value={toLocalDateTimeInput(b.value)}
                        onChange={(e) => {
                          const iso = fromLocalDateTimeInput(e.target.value);
                          if (iso) patch(b.id, { value: iso });
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">{t("studio.countdown.help")}</p>
                    </>
                  ) : isHandleBlock(b.kind) && b.kind !== "matrix" ? (
                    <>
                      <SocialHandleInput
                        kind={b.kind}
                        label={b.label}
                        value={b.value}
                        onChange={(handle) => patch(b.id, { value: handle })}
                        placeholder={
                          BLOCK_KINDS.find((k) => k.kind === b.kind)?.placeholder?.replace(
                            /^@/,
                            "",
                          ) ?? t("studio.links.username")
                        }
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t("studio.links.handleHelp")}
                      </p>
                      <SocialBlockSettings platform={b.kind} handle={b.value} />
                    </>
                  ) : (
                    <>
                      <Input
                        className="input-field h-11 rounded-xl"
                        placeholder={BLOCK_KINDS.find((k) => k.kind === b.kind)?.placeholder}
                        value={b.value}
                        maxLength={400}
                        onChange={(e) => patch(b.id, { value: e.target.value })}
                        onBlur={(e) => patch(b.id, { value: sanitizeUrl(e.target.value) })}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {hint.prefix && (
                          <span className="mr-1 font-mono text-foreground">{hint.prefix}</span>
                        )}
                        {hint.help}
                      </p>
                    </>
                  )}
                  {isPromoBlock(b.kind) && (
                    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
                      <p className="text-[11px] font-medium text-foreground">{t("studio.links.promo")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PROMO_BADGE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => patch(b.id, { badge: preset })}
                            className="rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <Input
                        className="input-field h-9 rounded-xl"
                        placeholder={t("studio.links.badge")}
                        maxLength={32}
                        value={b.badge ?? ""}
                        onChange={(e) => patch(b.id, { badge: e.target.value })}
                      />
                      <Input
                        type="datetime-local"
                        className="input-field h-9 rounded-xl"
                        aria-label={t("studio.links.expires")}
                        value={toLocalDateTimeInput(b.expiresAt)}
                        onChange={(e) => setScheduleField(b, "expiresAt", e.target.value)}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {PROMO_COPY_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => patch(b.id, { label: preset })}
                            className="rounded-full border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
                    <p className="text-[11px] font-medium text-foreground">{t("studio.links.schedule")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-[10px] text-muted-foreground">
                        {t("studio.links.from")}
                        <Input
                          type="datetime-local"
                          className="input-field h-9 rounded-xl"
                          value={toLocalDateTimeInput(b.startsAt)}
                          onChange={(e) => setScheduleField(b, "startsAt", e.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-muted-foreground">
                        {t("studio.links.until")}
                        <Input
                          type="datetime-local"
                          className="input-field h-9 rounded-xl"
                          value={toLocalDateTimeInput(b.expiresAt)}
                          onChange={(e) => setScheduleField(b, "expiresAt", e.target.value)}
                        />
                      </label>
                    </div>
                    {!isValidScheduleWindow(b.startsAt, b.expiresAt) && (
                      <p role="alert" className="text-[11px] text-destructive">{t("studio.links.scheduleInvalid")}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {b.thumbnailUrl && (
                        <img
                          src={b.thumbnailUrl}
                          alt=""
                          className="h-8 w-8 rounded-md border border-border object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => pickThumbnail(b.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-muted"
                      >
                        <ImagePlus className="h-3.5 w-3.5" /> {t("studio.links.thumbnail")}
                      </button>
                      <div
                        role="radiogroup"
                        aria-label={t("studio.links.icon")}
                        className="inline-flex overflow-hidden rounded-lg border border-border text-[11px]"
                      >
                        {(["favicon", "globe"] as const).map((mode) => {
                          const active = (b.iconMode ?? "favicon") === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => patch(b.id, { iconMode: mode })}
                              className={cn(
                                "px-2 py-1 transition-colors",
                                active ? "bg-foreground text-background" : "hover:bg-muted",
                              )}
                            >
                              {mode === "favicon" ? t("studio.links.favicon") : t("studio.links.globe")}
                            </button>
                          );
                        })}
                      </div>
                      {b.thumbnailUrl && (
                        <button
                          type="button"
                          onClick={() => patch(b.id, { thumbnailUrl: "" })}
                          className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive"
                        >
                          {t("studio.links.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 rounded-xl border border-border/60 bg-background p-3">
                    <p className="text-[11px] font-medium text-foreground">{t("studio.links.tileSize")}</p>
                    <div role="radiogroup" aria-label={t("studio.links.tileSize")} className="flex flex-wrap gap-1.5">
                      {([undefined, ...BLOCK_SIZES] as const).map((size) => {
                        const active = (b.size ?? undefined) === size;
                        return (
                          <button
                            key={size ?? "row"}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => patch(b.id, { size })}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                              active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {t(`studio.links.tile.${size ?? "row"}`)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{t("studio.links.tileHelp")}</p>
                  </div>
                  {isPlainLinkKind(b.kind) && (
                    <div className="space-y-1.5 rounded-xl border border-border/60 bg-background p-3">
                      <p className="text-[11px] font-medium text-foreground">{t("studio.logoBar.tileType")}</p>
                      <div role="radiogroup" aria-label={t("studio.logoBar.tileType")} className="flex flex-wrap gap-1.5">
                        {(["button", "icon", "both"] as const satisfies readonly LinkDisplay[]).map((d) => {
                          const active = effectiveLinkDisplay(b, linkMode) === d;
                          return (
                            <button
                              key={d}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => patch(b.id, { display: d })}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                                active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {t(`studio.logoBar.display.${d}`)}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{b.display ? t("studio.logoBar.own") : t("studio.logoBar.followsProfile")}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("studio.links.up")}
                      disabled={index === 0}
                      onClick={() => move(b.id, -1)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("studio.links.down")}
                      disabled={index === blocks.length - 1}
                      onClick={() => move(b.id, 1)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onBlocksChange((x) => x.filter((y) => y.id !== b.id))}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("studio.links.delete")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
