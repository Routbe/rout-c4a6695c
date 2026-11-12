import { useState, type ReactNode } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Clapperboard, GripVertical, ImagePlus, Pin, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GalleryImageDialog } from "@/components/dashboard/GalleryImageDialog";
import type { GalleryItem } from "@/lib/gallery";
import { galleryImageSrc } from "@/lib/image-proxy-rules";
import {
  SOCIAL_GRID_MAX_ITEMS,
  SOCIAL_GRID_PLATFORMS,
  detectSocialGridTarget,
  moveSocialGridItem,
  newSocialGridItemId,
  normalizeSocialGridTarget,
  parseSocialGridConfig,
  serializeSocialGridConfig,
  type SocialGridConfig,
  type SocialGridItem,
} from "@/lib/social-grid";
import { cn } from "@/lib/utils";
import { OmniIngestPanel } from "@/components/dashboard/OmniIngestPanel";
import { classifyOmniUrl, OMNI_CONTENT_TYPES } from "@/lib/omni-ingest";

/**
 * Studio panel for the native Social Grid. Every change goes through the
 * block value, so it lands in the private draft and only goes live on Publish.
 */
export function SocialGridBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [replaceId, setReplaceId] = useState<string | null>(null);
  /** Raw link text per card while typing; only valid links are stored. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const config = parseSocialGridConfig(value);
  const full = config.items.length >= SOCIAL_GRID_MAX_ITEMS;

  const update = (patch: Partial<SocialGridConfig>) => {
    onChange(serializeSocialGridConfig({ ...config, ...patch }));
    if (patch.title !== undefined) onTitle(patch.title.trim() || t("studio.grid.defaultTitle"));
  };
  const patchItem = (id: string, patch: Partial<SocialGridItem>) =>
    update({ items: config.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const move = (from: number, to: number) => update({ items: moveSocialGridItem(config.items, from, to) });

  const addFromDialog = (picked: GalleryItem) => {
    if (replaceId) {
      patchItem(replaceId, { mediaUrl: picked.url, kineticPreviewUrl: undefined });
      setReplaceId(null);
      return;
    }
    const target = normalizeSocialGridTarget(picked.linkUrl ?? "") ?? undefined;
    const detected = target ? detectSocialGridTarget(target) : null;
    const item: SocialGridItem = {
      id: newSocialGridItemId(),
      mediaUrl: picked.url,
      caption: picked.caption || picked.alt || undefined,
      targetUrl: target,
      platform: detected?.platform ?? (target ? "article" : "custom"),
      isVideo: detected?.isVideo ?? false,
      contentType: target && !target.startsWith("/") ? classifyOmniUrl(target) : "social",
      pinned: false,
      createdAt: new Date().toISOString(),
    };
    update({ items: [...config.items, item].slice(0, SOCIAL_GRID_MAX_ITEMS) });
    setOpen(item.id);
  };

  const onTargetInput = (item: SocialGridItem, raw: string) => {
    setDrafts((d) => ({ ...d, [item.id]: raw }));
    if (!raw.trim()) {
      patchItem(item.id, { targetUrl: undefined });
      return;
    }
    const target = normalizeSocialGridTarget(raw);
    if (!target) return;
    const detected = detectSocialGridTarget(target);
    patchItem(item.id, detected ? { targetUrl: target, platform: detected.platform, isVideo: detected.isVideo } : { targetUrl: target });
  };

  return (
    <div className="space-y-2.5 border-t border-border/60 pt-3">
      <p className="text-[11px] font-medium text-foreground">{t("studio.grid.heading")}</p>

      <OmniIngestPanel full={full} onAdd={(item) => {
        if (config.items.some((existing) => existing.id === item.id)) return;
        update({ items: [...config.items, item].slice(0, SOCIAL_GRID_MAX_ITEMS) });
        setOpen(item.id);
      }} />

      <Input
        className="input-field h-9 rounded-xl"
        placeholder={t("studio.grid.titlePlaceholder")}
        maxLength={80}
        value={config.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label={t("studio.grid.titleLabel")}
      />

      {config.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
          {t("studio.grid.empty")}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          move(config.items.findIndex(i => i.id === active.id), config.items.findIndex(i => i.id === over.id));
        }}>
        <SortableContext items={config.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {config.items.map((item, index) => {
            const expanded = open === item.id;
            const raw = drafts[item.id] ?? item.targetUrl ?? "";
            const targetInvalid = raw.trim() !== "" && normalizeSocialGridTarget(raw) === null;
            return (
              <SortableCard key={item.id} id={item.id} label={t("studio.grid.drag")}>
                <div className="flex items-center gap-1.5 p-1.5 pl-8">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    <img src={galleryImageSrc(item.mediaUrl) ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {item.isVideo && <Clapperboard className="absolute right-0.5 top-0.5 h-3 w-3 text-background drop-shadow" aria-hidden />}
                  </div>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setOpen(expanded ? null : item.id)}
                    aria-expanded={expanded}
                    className="h-auto min-w-0 flex-1 flex-col items-start gap-0 text-left"
                  >
                    <span className="block truncate text-[11px] font-medium text-foreground">
                      {item.caption || t(`studio.grid.platform.${item.platform}`)}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {item.targetUrl || t("studio.grid.noTarget")}
                    </span>
                  </Button>
                  {item.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-foreground" aria-label={t("studio.grid.pinned")} />}
                  <Button variant="ghost" type="button" aria-label={t("studio.grid.moveUp")} disabled={index === 0} onClick={() => move(index, index - 1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" type="button" aria-label={t("studio.grid.moveDown")} disabled={index === config.items.length - 1} onClick={() => move(index, index + 1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {expanded && (
                  <div className="space-y-2 border-t border-border/60 p-2">
                    <Button variant="outline" size="sm" onClick={() => { setReplaceId(item.id); setDialog(true); }}><ImagePlus className="h-3.5 w-3.5" /> {t("studio.grid.replace")}</Button>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">{t("studio.grid.target")}</span>
                      <Input
                        className="input-field h-9 rounded-xl"
                        inputMode="url"
                        placeholder={t("studio.grid.targetPlaceholder")}
                        value={raw}
                        onChange={(e) => onTargetInput(item, e.target.value)}
                        aria-invalid={targetInvalid}
                      />
                      {targetInvalid && <span className="block text-[10px] text-destructive">{t("studio.grid.targetError")}</span>}
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">{t("studio.grid.caption")}</span>
                      <Input
                        className="input-field h-9 rounded-xl"
                        maxLength={150}
                        value={item.caption ?? ""}
                        onChange={(e) => patchItem(item.id, { caption: e.target.value || undefined })}
                      />
                    </label>
                    <div className="space-y-1">
                      <label className="block space-y-1 text-[10px] text-muted-foreground">{t("omni.type")}
                        <Select value={item.contentType ?? "social"} onValueChange={(value) => { const contentType = OMNI_CONTENT_TYPES.find((type) => type === value); if (contentType) patchItem(item.id, { contentType }); }}>
                          <SelectTrigger aria-label={t("omni.type")}><SelectValue /></SelectTrigger>
                          <SelectContent>{OMNI_CONTENT_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`studio.grid.type.${type}`)}</SelectItem>)}</SelectContent>
                        </Select>
                      </label>
                      <Input aria-label={t("omni.meta")} placeholder={t("omni.metaPlaceholder")} maxLength={40} value={item.metaTag ?? ""} onChange={(event) => patchItem(item.id, { metaTag: event.target.value || undefined })} />
                      <label className="flex items-center justify-between gap-2 py-2">
                        <span className="text-[11px] font-medium text-foreground">{t("omni.hero")}</span>
                        <Switch aria-label={t("omni.heroLabel")} checked={item.isHero === true} onCheckedChange={(isHero) => patchItem(item.id, { isHero })} />
                      </label>
                      <span className="text-[10px] font-medium text-muted-foreground">{t("studio.grid.platformLabel")}</span>
                      <div className="grid grid-cols-4 gap-1">
                        {SOCIAL_GRID_PLATFORMS.map((p) => (
                          <Button variant="ghost"
                            key={p}
                            type="button"
                            onClick={() => patchItem(item.id, { platform: p })}
                            aria-pressed={item.platform === p}
                            className={cn(
                              "rounded-lg border px-1 py-1.5 text-[10px] font-medium",
                              item.platform === p ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {t(`studio.grid.platform.${p}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span>
                        <span className="block text-[11px] font-medium text-foreground">{t("studio.grid.video")}</span>
                        <span className="block text-[10px] text-muted-foreground">{t("studio.grid.videoHint")}</span>
                      </span>
                      <Switch checked={item.isVideo} onCheckedChange={(v) => patchItem(item.id, { isVideo: v })} />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-foreground">{t("studio.grid.pin")}</span>
                      <Switch checked={item.pinned} onCheckedChange={(v) => patchItem(item.id, { pinned: v })} />
                    </label>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => update({ items: config.items.filter((i) => i.id !== item.id) })}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("studio.grid.delete")}
                    </Button>
                  </div>
                )}
              </SortableCard>
            );
          })}
        </ul>
        </SortableContext>
        </DndContext>
      )}

      <Button variant="ghost"
        type="button"
        onClick={() => { setReplaceId(null); setDialog(true); }}
        disabled={full}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-[11px] font-medium hover:bg-muted disabled:opacity-50"
      >
        <ImagePlus className="h-3.5 w-3.5" /> {t("studio.grid.add")}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        {t("studio.grid.count", { count: config.items.length, max: SOCIAL_GRID_MAX_ITEMS })}
      </p>

      <GalleryImageDialog localOnly open={dialog} onOpenChange={(next) => { setDialog(next); if (!next) setReplaceId(null); }} onAdd={addFromDialog} />
    </div>
  );
}

function SortableCard({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative rounded-lg border border-border/60 bg-background", isDragging && "z-10 opacity-60")}>
    <Button variant="ghost" size="icon" {...attributes} {...listeners} aria-label={label} title={label} className="absolute left-1 top-3 h-7 w-6 [touch-action:none] cursor-grab"><GripVertical className="h-4 w-4" /></Button>
    {children}
  </li>;
}
