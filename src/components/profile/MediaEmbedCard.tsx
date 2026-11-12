import { useTranslation } from "react-i18next";
import { useMemo, useState, type CSSProperties } from "react";
import { FileText, Play } from "lucide-react";

import { parseMediaEmbedConfig } from "@/lib/media-embed";
import { resolveMediaEmbed } from "@/lib/media-embed-parser";

/**
 * Publieke renderer van het `media_embed`-blok: toont een inline,
 * lazy-geladen player (YouTube nocookie, Spotify, SoundCloud, Apple Music,
 * Vimeo) of een PDF-previewkaart. `style` volgt de knopstijl van het profiel.
 */
export function MediaEmbedCard({ value, style }: { value: string; style?: CSSProperties }) {
  const { t } = useTranslation();
  const config = useMemo(() => parseMediaEmbedConfig(value), [value]);
  const embed = useMemo(() => resolveMediaEmbed(config.url), [config.url]);
  /** Players laden pas na de eerste interactie (lazy + geen autoplay-verrassing). */
  const [activated, setActivated] = useState(false);

  if (!embed) return null;

  const frameClass = "w-full overflow-hidden rounded-2xl border border-zinc-200/80 shadow-sm";

  if (embed.kind === "document") {
    return (
      <div className={frameClass} style={style}>
        {config.caption && (
          <p className="border-b border-border/40 px-4 pt-3 text-sm font-medium">
            {config.caption}
          </p>
        )}
        <div className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{embed.label}</span>
            <span className="block truncate text-xs opacity-70">{embed.sourceUrl}</span>
          </span>
          <a
            href={embed.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
          >
             {t("profile.viewPdf")} </a>
        </div>
      </div>
    );
  }

  const ratioClass =
    embed.kind === "audio"
      ? config.ratio === "expanded"
        ? "h-[352px]"
        : "h-[152px]"
      : config.ratio === "9:16"
        ? "aspect-[9/16] max-h-[70vh]"
        : "aspect-video";

  return (
    <div className={frameClass} style={style}>
      {config.caption && (
        <p className="border-b border-border/40 px-4 pt-3 text-sm font-medium">{config.caption}</p>
      )}
      {activated ? (
        <iframe
          src={embed.embedUrl}
          title={config.caption || embed.label}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen={embed.kind === "video"}
          className={`block w-full ${ratioClass}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setActivated(true)}
          aria-label={`${embed.label} afspelen`}
          className={`flex w-full flex-col items-center justify-center gap-2 bg-muted/30 transition-colors hover:bg-muted/50 ${ratioClass}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
            <Play className="ml-0.5 h-5 w-5" aria-hidden />
          </span>
          <span className="text-xs font-medium opacity-70">
            {embed.label}  {t("profile.tapToPlay")} </span>
        </button>
      )}
    </div>
  );
}
