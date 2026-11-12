import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { galleryImageSrc } from "@/lib/image-proxy-rules";
import { isSocialGridMediaUrl } from "@/lib/social-grid";
import { isAllowedProxyUrl } from "@/lib/image-proxy-rules";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadGalleryMedia } from "@/lib/gallery-media.functions";
import { uploadGridCover } from "@/lib/omni-upload.functions";
import {
  GALLERY_ALLOWED_TYPES,
  GALLERY_MAX_BYTES,
    newGalleryItemId,
  type GalleryItem,
} from "@/lib/gallery";
import { cn } from "@/lib/utils";

/** Leest een bestand als pure base64 (zonder data-URL prefix). */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Twee-tabs dialoog om een foto aan de galerij toe te voegen:
 * eigen upload (10 MB) of een externe afbeeldings-URL.
 */
export function GalleryImageDialog({
  open,
  onOpenChange,
  onAdd,
  localOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: GalleryItem) => void;
  localOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(localOnly ? "upload" : "url");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [urlOk, setUrlOk] = useState<boolean | null>(null);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setUrl("");
    setUrlOk(null);
    setCaption("");
    setAlt("");
    setLinkUrl("");
    setDragging(false);
    setTab(localOnly ? "upload" : "url");
  }

  function commit(imageUrl: string) {
    onAdd({
      id: newGalleryItemId(),
      url: imageUrl,
      caption: caption.trim() || undefined,
      alt: alt.trim() || undefined,
      linkUrl: linkUrl.trim() || undefined,
    });
    reset();
    onOpenChange(false);
  }

  async function handleFile(file: File | undefined | null) {
    if (!file || busy) return;
    if (!GALLERY_ALLOWED_TYPES.includes(file.type)) {
      toast.error(t("studio.grid.media.types"));
      return;
    }
    if (file.size > GALLERY_MAX_BYTES) {
      toast.error(t("studio.grid.media.size"));
      return;
    }
    setBusy(true);
    try {
      let upload = file;
      if (localOnly) {
        if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("unsupported_image");
        const bitmap = await createImageBitmap(file);
        try {
          const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("conversion_unavailable");
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("conversion_failed")), "image/webp", .82));
          upload = new File([blob], "cover.webp", { type: "image/webp" });
        } finally { bitmap.close(); }
      }
      const base64 = await readBase64(upload);
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const res = localOnly ? await uploadGridCover({ data: { base64 } }) : await uploadGalleryMedia({
        data: { base64, contentType: file.type, ext },
      });
      if (!res.ok || !res.url) {
        toast.error(res.message ?? t("studio.grid.media.failed"));
        return;
      }
      commit(res.url);
    } catch {
      toast.error(t("studio.grid.media.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("studio.grid.media.title")}</DialogTitle>
        </DialogHeader>

        <Tabs value={localOnly ? "upload" : tab} onValueChange={setTab}>
          {!localOnly && <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">{t("studio.grid.media.upload")}</TabsTrigger>
            <TabsTrigger value="url">{t("studio.grid.media.url")}</TabsTrigger>
          </TabsList>}

          <TabsContent value="upload" className="pt-3">
            <Button variant="ghost"
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              disabled={busy}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-center transition-colors",
                dragging && "border-foreground bg-muted",
                busy && "opacity-60",
              )}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{t("studio.grid.media.drop")}</span>
              <span className="text-[11px] text-muted-foreground">
                {t("studio.grid.media.types")}
              </span>
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept={GALLERY_ALLOWED_TYPES.filter((type) => !localOnly || type !== "image/svg+xml").join(",")}
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </TabsContent>

          <TabsContent value="url" className="space-y-2 pt-3">
            <Input
              className="input-field h-9 rounded-xl"
              placeholder="https://…"
              value={url}
              maxLength={2000}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlOk(null);
              }}
              aria-label={t("studio.grid.media.url")}
            />
            {url.trim() !== "" && !(isSocialGridMediaUrl(url) || isAllowedProxyUrl(url)) && (
              <p className="text-[11px] font-medium text-destructive" role="alert">
                {t("studio.grid.media.invalid")}
              </p>
            )}
            {(isSocialGridMediaUrl(url) || isAllowedProxyUrl(url)) && (
              <div className="overflow-hidden rounded-xl border border-border bg-muted">
                <img
                  src={galleryImageSrc(url) ?? undefined}
                  alt={t("studio.grid.media.preview")}
                  loading="lazy"
                  className="max-h-40 w-full object-contain"
                  onLoad={() => setUrlOk(true)}
                  onError={() => setUrlOk(false)}
                />
              </div>
            )}
            {urlOk === false && (
              <p className="text-[11px] font-medium text-destructive" role="alert">
                {t("studio.grid.media.invalid")}
              </p>
            )}
            <Button variant="ghost"
              type="button"
              disabled={!(isSocialGridMediaUrl(url) || isAllowedProxyUrl(url)) || urlOk !== true}
              onClick={() => commit(url.trim())}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-foreground text-sm font-medium text-background disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" /> {t("studio.grid.add")}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="space-y-2 border-t border-border pt-3">
          <Input
            className="input-field h-9 rounded-xl"
            placeholder={t("studio.grid.media.caption")}
            maxLength={160}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            aria-label={t("studio.grid.caption")}
          />
          <Input
            className="input-field h-9 rounded-xl"
            placeholder={t("studio.grid.media.alt")}
            maxLength={160}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            aria-label={t("studio.grid.media.alt")}
          />
          <Input
            className="input-field h-9 rounded-xl"
            placeholder={t("studio.grid.target")}
            maxLength={2000}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            aria-label={t("studio.grid.target")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
