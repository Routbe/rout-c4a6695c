import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioChip } from "@/components/studio/StudioChip";
import { OG_FORMATS, OG_FORMAT_ORDER, type OgFormat } from "@/lib/og-formats";
import { profilePreviewPath } from "@/lib/profile-preview";
import { parseShareCardLang, shareCardPath, type ShareCardKind } from "@/lib/og-action-card";

type Kind = "profile" | ShareCardKind;
const ACTION_KINDS: ShareCardKind[] = ["ask", "donate", "tip", "booking"];

/** Relative PNG path for one card in one format; `v` only forces a fresh browser copy. */
export function shareImagePath(handle: string, space: "root" | "alias" | "workspace", kind: Kind, format: OgFormat, lang: string, v = 0): string {
  const base = kind === "profile" || space === "workspace"
    ? profilePreviewPath(handle, space, "png", format)
    : shareCardPath(handle, kind, parseShareCardLang(lang), space, format);
  return v ? `${base}${base.includes("?") ? "&" : "?"}v=${v}` : base;
}

/**
 * Every automatic share image in every format (link preview, square, portrait,
 * story), drawn by ROUT from the saved profile, ready to preview and download.
 */
export function ShareImageFormats({ handle, space = "root", isPublic = true }: { handle: string; space?: "root" | "alias" | "workspace"; isPublic?: boolean }) {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<Kind>("profile");
  const [version, setVersion] = useState(0);
  const clean = handle.replace(/^@+/, "").trim();
  const lang = parseShareCardLang(i18n.resolvedLanguage ?? null);
  if (!clean) return null;
  const kinds: Kind[] = space === "workspace" ? ["profile"] : ["profile", ...ACTION_KINDS];

  return (
    <section className="space-y-3" aria-labelledby="share-formats-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p id="share-formats-title" className="text-xs font-medium">{t("studio.shareFormats.title")}</p>
          <p className="text-[11px] text-muted-foreground">{t("studio.shareFormats.help")}</p>
        </div>
        {isPublic && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setVersion(Date.now())}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t("studio.shareFormats.refresh")}
          </Button>
        )}
      </div>
      {!isPublic ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">{t("studio.shareFormats.private")}</p>
      ) : (
        <>
          {kinds.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("studio.shareFormats.kindLabel")}>
              {kinds.map((k) => (
                <StudioChip key={k} active={kind === k} onClick={() => setKind(k)}>{t(`studio.shareFormats.kind.${k}`)}</StudioChip>
              ))}
            </div>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {OG_FORMAT_ORDER.map((format) => {
              const { width, height } = OG_FORMATS[format];
              const src = shareImagePath(clean, space, kind, format, lang, version);
              return (
                <li key={format} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-2">
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    <img src={src} alt={t("studio.shareFormats.alt", { format: t(`studio.shareFormats.format.${format}`) })} width={width} height={height} loading="lazy" decoding="async" className="max-h-full w-auto max-w-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{t(`studio.shareFormats.format.${format}`)}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">{width} × {height}</p>
                    <p className="text-[11px] text-muted-foreground">{t(`studio.shareFormats.use.${format}`)}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-auto h-8 gap-1.5 text-xs">
                    <a href={src} download={`rout-${clean}-${kind}-${format}.png`}>
                      <Download className="h-3.5 w-3.5" aria-hidden /> {t("studio.shareFormats.download")}
                    </a>
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
