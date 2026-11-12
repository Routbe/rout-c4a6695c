import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { GalleryImageDialog } from "@/components/dashboard/GalleryImageDialog";
import {
  GALLERY_LAYOUTS,
  GALLERY_MAX_ITEMS,
  parseGalleryConfig,
  serializeGalleryConfig,
  type GalleryConfig,
  type GalleryItem,
  newGalleryItemId,
  galleryUploadCount,
} from "@/lib/gallery";
import { LIFETIME_MAX_FILES } from "@/lib/asset-retention";
import { proxied } from "@/lib/image-proxy-rules";

/** Studio-paneel voor het native `media_gallery`-component. */
export function GalleryBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const [dialog, setDialog] = useState(false);
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const addUrl = () => {
    const url = urlInput.trim();
    // Only https links from hosts the privacy proxy may load; anything else would show broken.
    if (!proxied(url)) {
      setUrlError(t("studio.gallery.linkError"));
      return;
    }
    setUrlError("");
    addItem({ id: newGalleryItemId(), url, alt: "", caption: "" } as GalleryItem);
    setUrlInput("");
  };
  const config = parseGalleryConfig(value);

  const update = (patch: Partial<GalleryConfig>) => {
    onChange(serializeGalleryConfig({ ...config, ...patch }));
    if (patch.title !== undefined) onTitle(patch.title);
  };

  const addItem = (item: GalleryItem) =>
    update({ items: [...config.items, item].slice(0, GALLERY_MAX_ITEMS) });

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Galerij / Media</p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Titel van de collectie"
        maxLength={80}
        value={config.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label="Collectietitel"
      />

      <div className="grid grid-cols-2 gap-1.5">
        {GALLERY_LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => update({ layout: layout.id })}
            title={layout.hint}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
              config.layout === layout.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {layout.label}
          </button>
        ))}
      </div>

      {config.items.length > 0 && (
        <ul className="space-y-1.5">
          {config.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 p-1.5"
            >
              <img
                src={item.url}
                alt=""
                loading="lazy"
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {item.caption || item.alt || item.url}
              </span>
              <button
                type="button"
                aria-label="Foto verwijderen"
                onClick={() => update({ items: config.items.filter((i) => i.id !== item.id) })}
                className="rounded-md p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5">
        <Input
          className="input-field h-9 min-w-0 flex-1 rounded-xl"
          placeholder={t("studio.gallery.linkPlaceholder")}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
          aria-label={t("studio.gallery.linkLabel")}
        />
        <button type="button" onClick={addUrl} disabled={!urlInput.trim() || config.items.length >= GALLERY_MAX_ITEMS} className="h-9 shrink-0 rounded-xl border border-border px-3 text-[11px] font-medium hover:bg-muted disabled:opacity-50">{t("studio.gallery.addLink")}</button>
      </div>
      {urlError && <p className="text-[10px] text-destructive">{urlError}</p>}
      <button
        type="button"
        onClick={() => setDialog(true)}
        disabled={config.items.length >= GALLERY_MAX_ITEMS}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-[11px] font-medium hover:bg-muted disabled:opacity-50"
      >
        <ImagePlus className="h-3.5 w-3.5" /> {t("studio.gallery.upload")}
      </button>
      <p className="text-[10px] text-muted-foreground">
        {t("studio.gallery.quota", { count: config.items.length, max: GALLERY_MAX_ITEMS, used: galleryUploadCount(config.items), limit: LIFETIME_MAX_FILES })}
      </p>

      <GalleryImageDialog open={dialog} onOpenChange={setDialog} onAdd={addItem} />
    </div>
  );
}
