import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressFavicon, isAcceptedImage } from "@/lib/imageCompressor";

/**
 * Favicon-upload met client-side compressie: elk bestand wordt naar maximaal
 * 64×64 WebP (< 15 KB) geschaald voordat het als data-URL in
 * `profiles.favicon_url` landt.
 */
export function FaviconUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
  const { t } = useTranslation();
    if (!file) return;
    if (!isAcceptedImage(file)) {
      toast.error(t("studio.favicon.error"));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressFavicon(file);
      onChange(dataUrl);
      toast.success(t("studio.favicon.saved"));
    } catch {
      toast.error(t("studio.favicon.error"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt={t("studio.favicon.preview")}
            width={24}
            height={24}
            className="h-6 w-6 rounded-[4px] border border-border object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-dashed border-border text-[9px] text-muted-foreground">
            24
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("studio.favicon.uploading")} </>
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden /> {t("studio.favicon.choose")} </>
          )}
        </Button>
        {value && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => onChange("")}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("studio.common.delete")} </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <p className="text-[11px] text-muted-foreground"> {t("studio.favicon.help")} </p>
    </div>
  );
}
