import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2, Pause, Play } from "lucide-react";

import { normalizeAudioBlockUrl, parseAudioBlockConfig } from "@/lib/audio-block";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Public renderer of the universal `audio_player` block: a minimalist player
 * for any hosted audio URL. The file loads only after the visitor presses
 * play (no autoplay, no third-party trackers — the URL points straight at the
 * audio, never at an embed iframe). `style` follows the profile's button style.
 */
export function AudioBlockCard({ value, style }: { value: string; style?: CSSProperties }) {
  const config = parseAudioBlockConfig(value);
  const src = normalizeAudioBlockUrl(config.url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  if (!src) return null;

  const toggle = async () => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }
    if (audioRef.current) {
      await audioRef.current.play().catch(() => setState("error"));
      setState("playing");
      return;
    }
    setState("loading");
    const audio = new Audio(src);
    audio.preload = "metadata";
    audioRef.current = audio;
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    audio.onended = () => {
      setState("idle");
      setProgress(0);
    };
    audio.onerror = () => setState("error");
    try {
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur" style={style}>
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={state === "loading"}
          aria-label={state === "playing" ? "Pauzeer audio" : "Speel audio af"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {state === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : state === "playing" ? (
            <Pause className="h-5 w-5" aria-hidden />
          ) : (
            <Play className="ml-0.5 h-5 w-5" aria-hidden />
          )}
        </button>
        <div className="min-w-0 flex-1">
          {config.caption && <p className="truncate text-sm font-medium">{config.caption}</p>}
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Voortgang"
            onClick={seek}
            className="mt-1.5 h-1.5 w-full cursor-pointer rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {state === "error" ? "Niet beschikbaar" : formatTime(duration)}
        </span>
      </div>
      {config.transcript && (
        <p className="whitespace-pre-line border-t border-border/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {config.transcript}
        </p>
      )}
    </div>
  );
}
