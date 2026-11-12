import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import {
  MEDIA_EMBED_RATIOS,
  parseMediaEmbedConfig,
  serializeMediaEmbedConfig,
  type MediaEmbedConfig,
} from "@/lib/media-embed";
import { resolveMediaEmbed } from "@/lib/media-embed-parser";

/** Studio-paneel voor het universele `media_embed`-component. */
export function MediaEmbedBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parseMediaEmbedConfig(value);
  const embed = useMemo(() => resolveMediaEmbed(config.url), [config.url]);

  const update = (patch: Partial<MediaEmbedConfig>) => {
    const next = { ...config, ...patch };
    onChange(serializeMediaEmbedConfig(next));
    if (patch.caption !== undefined) onTitle(patch.caption || "Media embed");
  };

  const isAudio = embed?.kind === "audio";
  const ratios = MEDIA_EMBED_RATIOS.filter((r) =>
    isAudio ? r.id === "compact" || r.id === "expanded" : r.id === "16:9" || r.id === "9:16",
  );

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Video, Muziek & Documenten</p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Plak een YouTube-, Spotify-, SoundCloud-, Vimeo- of PDF-link…"
        maxLength={500}
        value={config.url}
        onChange={(e) => update({ url: e.target.value })}
        aria-label="Media-URL"
      />

      {config.url.trim() && (
        <p
          className={`text-[11px] font-medium ${embed ? "text-emerald-600" : "text-destructive"}`}
          role="status"
        >
          {embed ? `🟢 ${embed.label} gedetecteerd` : "⚠️ Geen ondersteund mediaplatform herkend"}
        </p>
      )}

      {embed && (
        <div className="grid grid-cols-2 gap-1.5">
          {ratios.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => update({ ratio: r.id })}
              title={r.hint}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
                config.ratio === r.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
              <span className="block text-[10px] font-normal opacity-70">{r.hint}</span>
            </button>
          ))}
        </div>
      )}

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Titel / caption (optioneel)"
        maxLength={120}
        value={config.caption}
        onChange={(e) => update({ caption: e.target.value })}
        aria-label="Caption"
      />
    </div>
  );
}
