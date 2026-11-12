import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarHeart, Clock, Cloud, CloudLightning, CloudRain, CloudSnow, MapPin, Moon, Music2, Play, Sun, Wind } from "lucide-react";
import {
  countdownDays,
  formatLocalTime,
  isWidgetReady,
  mapEmbedUrl,
  musicEmbed,
  parseWidgetConfig,
  postEmbed,
  videoEmbed,
  type VisualWidgetKind,
  type WidgetConfig,
} from "@/lib/profile-widgets";
import { weatherStateFromCode } from "@/lib/ambient-weather";
import { galleryImageSrc, proxied } from "@/lib/image-proxy-rules";
import { getWidgetWeather } from "@/lib/visual-widgets.functions";
import { cn } from "@/lib/utils";

/**
 * Visual profile widget (wg_*). Third-party players only load after the
 * visitor taps them, so opening a profile never contacts YouTube, Spotify & co.
 */
export function VisualWidgetCard({ kind, label, value, style }: { kind: VisualWidgetKind; label: string; value: string; style?: CSSProperties }) {
  const config = parseWidgetConfig(value);
  if (!isWidgetReady(kind, config)) return null;
  const body = (() => {
    switch (kind) {
      case "wg_weather": return <WeatherBody config={config} />;
      case "wg_clock": return <ClockBody config={config} />;
      case "wg_map": return <MapBody config={config} label={label} />;
      case "wg_post": return <PostBody url={config.url!} />;
      case "wg_photo": return <PhotoBody config={config} label={label} />;
      case "wg_music": return <MusicBody url={config.url!} label={label} />;
      case "wg_birthday": return <CountdownBody config={config} label={label} />;
      case "wg_text": return <TextBody text={config.text!} label={label} />;
      case "wg_video": return <VideoBody url={config.url!} label={label} />;
    }
  })();
  return (
    <section data-widget={kind} className="flex h-full w-full flex-col overflow-hidden rounded-2xl text-left" style={style} aria-label={label}>
      {body}
    </section>
  );
}

/** Renders only after hydration so server and browser markup agree. */
function useNow(intervalMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Caption({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs opacity-70">
      <span className="shrink-0" aria-hidden>{icon}</span>
      <span className="truncate">{children}</span>
    </p>
  );
}

function WeatherIcon({ code, isDay, className }: { code: number; isDay: boolean; className?: string }) {
  const state = weatherStateFromCode(code);
  const Icon = state === "Rain" ? CloudRain : state === "Snow" ? CloudSnow : state === "Thunderstorm" ? CloudLightning : state === "Clear" ? (isDay ? Sun : Moon) : Cloud;
  return <Icon className={className} aria-hidden />;
}

function WeatherBody({ config }: { config: WidgetConfig }) {
  const { t } = useTranslation();
  const place = config.place!;
  const fetchWeather = useServerFn(getWidgetWeather);
  const q = useQuery({
    queryKey: ["widget-weather", place.lat, place.lon],
    queryFn: () => fetchWeather({ data: { lat: place.lat, lon: place.lon } }),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
  const w = q.data && q.data.ok ? q.data : null;
  const state = w ? weatherStateFromCode(w.code) : null;
  return (
    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
      <Caption icon={<MapPin className="h-3.5 w-3.5" />}>{place.name}</Caption>
      {w ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-4xl font-semibold tabular-nums leading-none">{Math.round(w.temperature)}°</p>
            <p className="mt-1 text-sm opacity-80">{t(`profile.vw.weather.${state ?? "Unknown"}`)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <WeatherIcon code={w.code} isDay={w.isDay} className="h-10 w-10" />
            <span className="inline-flex items-center gap-1 text-[11px] opacity-70"><Wind className="h-3 w-3" aria-hidden />{Math.round(w.wind)} km/u</span>
          </div>
        </div>
      ) : (
        <p className="text-sm opacity-70">{q.isLoading ? t("profile.vw.loading") : t("profile.vw.weatherUnavailable")}</p>
      )}
    </div>
  );
}

function ClockBody({ config }: { config: WidgetConfig }) {
  const { t, i18n } = useTranslation();
  const place = config.place!;
  const now = useNow(15_000);
  const time = now ? formatLocalTime(place.timezone, now, config.hour12, i18n.language || "nl") : "";
  const day = now ? new Intl.DateTimeFormat(i18n.language || "nl", { weekday: "long", day: "numeric", month: "long", timeZone: place.timezone }).format(now) : "";
  return (
    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
      <Caption icon={<Clock className="h-3.5 w-3.5" />}>{t("profile.vw.localTime", { city: place.name })}</Caption>
      <div>
        <p className="font-mono text-4xl font-semibold tabular-nums leading-none" suppressHydrationWarning>{time || "––:––"}</p>
        <p className="mt-1 text-sm capitalize opacity-80" suppressHydrationWarning>{day}</p>
      </div>
    </div>
  );
}

function MapBody({ config, label }: { config: WidgetConfig; label: string }) {
  const place = config.place!;
  const zoom = config.zoom ?? 10;
  return (
    <>
      <iframe
        src={mapEmbedUrl(place, zoom)}
        title={label || place.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block min-h-48 w-full flex-1 border-0"
      />
      <div className="px-4 py-2.5">
        <Caption icon={<MapPin className="h-3.5 w-3.5" />}>{[place.name, place.country].filter(Boolean).join(", ")}</Caption>
      </div>
    </>
  );
}

/** Click-to-load frame: nothing third-party loads until the visitor asks for it. */
function Facade({ provider, title, poster, onLoad, children }: { provider: string; title: string; poster?: string | null; onLoad: () => void; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onLoad}
      className="group relative flex min-h-40 w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden p-4 text-center"
      aria-label={t("profile.vw.load", { provider })}
    >
      {poster && <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />}
      <span className={cn("relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-current/30 backdrop-blur", poster && "bg-background/60")}>
        <Play className="h-5 w-5" aria-hidden />
      </span>
      <span className={cn("relative text-sm font-medium", poster && "rounded-full bg-background/70 px-3 py-1")}>{title}</span>
      {children}
      <span className={cn("relative text-[11px] opacity-70", poster && "rounded-full bg-background/70 px-2 py-0.5")}>{t("profile.vw.consent", { provider })}</span>
    </button>
  );
}

function PostBody({ url }: { url: string }) {
  const { t } = useTranslation();
  const embed = postEmbed(url)!;
  const [on, setOn] = useState(false);
  const provider = { instagram: "Instagram", x: "X", bluesky: "Bluesky", mastodon: "Mastodon" }[embed.provider];
  const did = useQuery({
    queryKey: ["bsky-did", embed.provider === "bluesky" ? embed.handle : ""],
    enabled: on && embed.provider === "bluesky",
    staleTime: Infinity,
    queryFn: async () => {
      if (embed.provider !== "bluesky") return null;
      if (embed.handle.startsWith("did:")) return embed.handle;
      const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(embed.handle)}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { did?: string };
      return typeof body.did === "string" && body.did.startsWith("did:") ? body.did : null;
    },
  });
  if (!on) return <Facade provider={provider} title={t("profile.vw.postTitle", { provider })} onLoad={() => setOn(true)} />;
  const src = embed.provider === "bluesky"
    ? did.data ? `https://embed.bsky.app/embed/${did.data}/app.bsky.feed.post/${embed.rkey}` : null
    : embed.src;
  if (!src) return <p className="p-4 text-sm opacity-70">{did.isLoading ? t("profile.vw.loading") : <a className="underline" href={url} target="_blank" rel="noopener noreferrer">{t("profile.vw.openPost", { provider })}</a>}</p>;
  return <iframe src={src} title={t("profile.vw.postTitle", { provider })} loading="lazy" className="block min-h-[28rem] w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-popups" />;
}

function PhotoBody({ config, label }: { config: WidgetConfig; label: string }) {
  const src = galleryImageSrc(config.url) ?? null;
  if (!src) return null;
  return (
    <figure className="relative flex h-full w-full flex-1 flex-col">
      <img src={src} alt={config.caption || label} loading="lazy" className="h-full min-h-40 w-full flex-1 object-cover" />
      {config.caption && <figcaption className="px-4 py-2.5 text-xs opacity-80">{config.caption}</figcaption>}
    </figure>
  );
}

function musicProvider(url: string): string {
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  return host.includes("spotify") ? "Spotify" : host.includes("apple") ? "Apple Music" : host.includes("soundcloud") ? "SoundCloud" : host.includes("deezer") ? "Deezer" : "Audio";
}

function MusicBody({ url, label }: { url: string; label: string }) {
  const [on, setOn] = useState(false);
  const provider = musicProvider(url);
  const src = musicEmbed(url)!;
  if (!on) {
    return (
      <Facade provider={provider} title={label || provider} onLoad={() => setOn(true)}>
        <Music2 className="relative h-4 w-4 opacity-60" aria-hidden />
      </Facade>
    );
  }
  return <iframe src={src} title={label || provider} loading="lazy" allow="autoplay; encrypted-media; clipboard-write" className="block h-[152px] w-full flex-1 border-0" />;
}

function youtubeId(src: string): string | null {
  return /youtube-nocookie\.com\/embed\/([\w-]+)/.exec(src)?.[1] ?? null;
}

function VideoBody({ url, label }: { url: string; label: string }) {
  const embed = videoEmbed(url)!;
  const [on, setOn] = useState(false);
  if (embed.kind === "file") {
    return <video src={embed.src} controls preload="metadata" playsInline className="block aspect-video w-full flex-1 bg-muted object-contain" aria-label={label} />;
  }
  const id = youtubeId(embed.src);
  const provider = id ? "YouTube" : "Vimeo";
  if (!on) {
    return <Facade provider={provider} title={label || provider} poster={id ? proxied(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`) : null} onLoad={() => setOn(true)} />;
  }
  const src = `${embed.src}${embed.src.includes("?") ? "&" : "?"}autoplay=1`;
  return <iframe src={src} title={label || provider} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="block aspect-video w-full flex-1 border-0" />;
}

function CountdownBody({ config, label }: { config: WidgetConfig; label: string }) {
  const { t } = useTranslation();
  const now = useNow(60_000);
  const days = now ? countdownDays(config, now) : null;
  const birthday = config.mode !== "event";
  const text = days === null ? "…" : days === 0 ? (birthday ? t("profile.vw.birthdayToday") : t("profile.vw.eventToday")) : days < 0 ? t("profile.vw.eventPast") : null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
      <CalendarHeart className="h-6 w-6 opacity-80" aria-hidden />
      <p className="text-sm font-medium">{label || (birthday ? t("profile.vw.birthday") : t("profile.vw.event"))}</p>
      {text ? (
        <p className="text-2xl font-semibold" suppressHydrationWarning>{text}</p>
      ) : (
        <p className="flex items-baseline gap-1.5" suppressHydrationWarning>
          <span className="text-4xl font-semibold tabular-nums">{days}</span>
          <span className="text-sm opacity-80">{t("profile.vw.days", { count: days ?? 0 })}</span>
        </p>
      )}
    </div>
  );
}

/** Light formatting: blank lines split paragraphs, **bold** and _italic_ — rendered as text, never as HTML. */
function formatInline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const token = m[0];
    out.push(token.startsWith("**") ? <strong key={m.index}>{token.slice(2, -2)}</strong> : <em key={m.index}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function TextBody({ text, label }: { text: string; label: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex flex-1 flex-col gap-2 p-4">
      {label && <p className="text-sm font-semibold">{label}</p>}
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line text-sm leading-relaxed opacity-90">{formatInline(p)}</p>
      ))}
    </div>
  );
}
