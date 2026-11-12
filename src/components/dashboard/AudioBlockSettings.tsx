import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AUDIO_BLOCK_LIMITS,
  isAudioBlockUrl,
  parseAudioBlockConfig,
  serializeAudioBlockConfig,
  type AudioBlockConfig,
} from "@/lib/audio-block";

/** Studio panel for the universal `audio_player` block: any hosted audio URL, no provider keys. */
export function AudioBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parseAudioBlockConfig(value);

  const update = (patch: Partial<AudioBlockConfig>) => {
    const next = { ...config, ...patch };
    onChange(serializeAudioBlockConfig(next));
    if (patch.caption !== undefined) onTitle(patch.caption || "Audio");
  };

  const urlState = config.url.trim() ? (isAudioBlockUrl(config.url) ? "ok" : "bad") : null;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Audio-speler</p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Link naar je audiobestand, bv. cdn.jouwdomein.be/intro.mp3"
        maxLength={AUDIO_BLOCK_LIMITS.url}
        value={config.url}
        onChange={(e) => update({ url: e.target.value })}
        aria-label="Audio-URL"
      />
      {urlState === "bad" && (
        <p className="text-[11px] text-destructive">Gebruik een geldige https-link naar een audiobestand.</p>
      )}
      {urlState === "ok" && (
        <p className="text-[11px] text-muted-foreground">Het bestand wordt rechtstreeks afgespeeld — zonder trackers of embeds.</p>
      )}

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Titel, bv. Inspiratie & Introductie"
        maxLength={AUDIO_BLOCK_LIMITS.caption}
        value={config.caption}
        onChange={(e) => update({ caption: e.target.value })}
        aria-label="Titel van het audioblok"
      />

      <Textarea
        className="input-field rounded-xl text-sm"
        placeholder="Optioneel transcript of bijschrift voor bezoekers"
        rows={3}
        maxLength={AUDIO_BLOCK_LIMITS.transcript}
        value={config.transcript}
        onChange={(e) => update({ transcript: e.target.value })}
        aria-label="Transcript"
      />
    </div>
  );
}
