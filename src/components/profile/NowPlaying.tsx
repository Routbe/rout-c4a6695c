import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveFresh } from "@/hooks/useLiveFresh";
import { proxied } from "@/lib/image-proxy-rules";

type NowPlayingData = {
  playing: boolean;
  title?: string;
  artist?: string;
  image?: string | null;
  url?: string | null;
  progressMs?: number;
  durationMs?: number;
  syncedAt?: number;
};

type Theme = { card: string; border: string; text: string; muted: string };

/** Shared poll so the capsule and the avatar status icon stay in sync. */
export function useNowPlaying(handle: string | null | undefined) {
  const q = useQuery({
    queryKey: ["now-playing", handle],
    enabled: Boolean(handle),
    queryFn: async (): Promise<NowPlayingData & { fetchedAt: number }> => {
      const r = await fetch(`/api/presence/now-playing?handle=${encodeURIComponent(handle!)}`);
      const d: NowPlayingData = r.ok ? await r.json() : { playing: false };
      // Anchor on the server's sync time, corrected for clock skew via the response's own arrival.
      const fetchedAt = d.syncedAt ? Math.min(Date.now(), d.syncedAt) : Date.now();
      return { ...d, fetchedAt };
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
  // A cached "playing" answer older than the live window (e.g. after failed polls) is never shown.
  const fresh = useLiveFresh("spotify", q.dataUpdatedAt);
  return fresh ? q : { ...q, data: undefined };
}

const BARS = 36;
/** Deterministic pseudo-waveform per track so it looks the same on every poll. */
function waveHeights(seed: string): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 16777619);
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / BARS);
    return 0.25 + 0.75 * r * envelope;
  });
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live progress between polls (interpolated locally, clamped to duration). */
function useLiveProgress(d: (NowPlayingData & { fetchedAt: number }) | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!d?.playing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [d?.playing]);
  if (!d?.playing || !d.durationMs) return { pos: 0, ratio: 0, ended: false };
  const raw = (d.progressMs ?? 0) + (now - d.fetchedAt);
  const pos = Math.min(d.durationMs, raw);
  return { pos, ratio: pos / d.durationMs, ended: raw >= d.durationMs };
}

function Waveform({ seed, ratio, color, muted }: { seed: string; ratio: number; color: string; muted: string }) {
  const heights = waveHeights(seed);
  const id = `np-grad-${seed.length}-${Math.round(heights[0]! * 1000)}`;
  return (
    <svg viewBox={`0 0 ${BARS * 4} 24`} className="glass-wave h-6 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.75" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      {heights.map((v, i) => {
        const played = (i + 0.5) / BARS <= ratio;
        const hgt = Math.max(3, v * 22);
        return (
          <rect
            key={i}
            x={i * 4 + 0.75}
            y={12 - hgt / 2}
            width={2.5}
            height={hgt}
            rx={1.25}
            fill={played ? `url(#${id})` : muted}
            opacity={played ? 1 : 0.35}
            className={played ? "glass-wave-bar" : undefined}
            style={{ animationDelay: `${(i % 6) * -0.15}s` }}
          />
        );
      })}
    </svg>
  );
}

/**
 * "Glass Media Capsule": frosted live Spotify player on a public profile.
 * Hidden when nothing plays. Mobile: compact peek pill that expands on tap.
 */
export function NowPlaying({ handle, theme }: { handle: string; theme: Theme }) {
  const { t } = useTranslation();
  const q = useNowPlaying(handle);
  const d = q.data;
  const { pos, ratio, ended } = useLiveProgress(d);
  const [open, setOpen] = useState(false);
  // End of track: fetch the next song once instead of waiting for the next poll.
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(() => void q.refetch(), 1500);
    return () => clearTimeout(t);
  }, [ended, d?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d?.playing) return null;
  const art = proxied(d.image);
  const seed = `${d.title}·${d.artist}`;

  const glass = {
    background: `color-mix(in srgb, ${theme.card} 45%, transparent)`,
    borderColor: `color-mix(in srgb, ${theme.text} 18%, transparent)`,
    color: theme.text,
  };

  const artwork = (size: string) =>
    art ? (
      <img src={art} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-xl object-cover shadow-lg`} />
    ) : (
      <span className={`${size} shrink-0 rounded-xl`} style={{ background: theme.border }} />
    );

  const full = (
    <div className="flex items-center gap-3">
      {artwork("h-16 w-16")}
      <div className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: theme.muted }}>
          <span className="now-playing-bars" aria-hidden><i /><i /><i /></span> {ended ? t("profile.loadingNext") : t("profile.listeningNow")}
        </span>
        <span className="block truncate text-sm font-semibold">{d.title}</span>
        <span className="block truncate text-xs" style={{ color: theme.muted }}>{d.artist}</span>
        {d.durationMs ? (
          <div className="mt-1.5">
            <Waveform seed={seed} ratio={ratio} color={theme.text} muted={theme.muted} />
            <div className="mt-0.5 flex justify-between font-mono text-[10px]" style={{ color: theme.muted }}>
              <span>{fmt(pos)}</span>
              <span>{fmt(d.durationMs)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mt-4 w-full max-w-sm">
      {/* Mobile: peek pill → expands on tap */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t("profile.collapsePlayer") : `Nu aan het luisteren: ${d.title}`}
        className="glass-capsule w-full rounded-2xl border p-2 text-left backdrop-blur-md transition-all duration-300 sm:hidden"
        style={glass}
      >
        {open ? (
          <div className="p-1">
            {full}
            {d.url && (
              <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="mt-2 block text-center text-xs underline" style={{ color: theme.muted }}>
                 {t("profile.openSpotify")} </a>
            )}
          </div>
        ) : (
          <span className="flex items-center gap-2.5">
            {artwork("h-9 w-9")}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{d.title}</span>
              <span className="block h-1 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${theme.muted} 30%, transparent)` }}>
                <span className="glass-glow block h-full rounded-full" style={{ width: `${ratio * 100}%`, background: theme.text }} />
              </span>
            </span>
            <span className="now-playing-bars mr-1" aria-hidden><i /><i /><i /></span>
          </span>
        )}
      </button>

      {/* Desktop: full capsule */}
      <div className="glass-capsule hidden rounded-2xl border p-3 backdrop-blur-md sm:block" style={glass}>
        {d.url ? (
          <a href={d.url} target="_blank" rel="noopener noreferrer" aria-label={`${d.title} op Spotify`}>{full}</a>
        ) : (
          full
        )}
      </div>
    </div>
  );
}


/** Custom live status pill (set from Studio or the presence API). Polls our own cached endpoint only. */
export function CustomStatusPill({ handle, theme }: { handle: string; theme: Theme }) {
  const q = useQuery({
    queryKey: ["custom-presence", handle],
    queryFn: async (): Promise<{ online: boolean; status?: string; icon?: string | null }> => {
      const r = await fetch(`/api/public/presence/${encodeURIComponent(handle)}`);
      return r.ok ? r.json() : { online: false };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  if (!q.data?.online || !q.data.status) return null;
  return (
    <div className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs" style={{ background: theme.card, borderColor: theme.border, color: theme.text }} aria-live="polite">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
      {q.data.icon && <span aria-hidden>{q.data.icon}</span>}
      <span className="truncate">{q.data.status}</span>
    </div>
  );
}
