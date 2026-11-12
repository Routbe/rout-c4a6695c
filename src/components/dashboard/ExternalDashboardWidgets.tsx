import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatTrackTime, interpolateProgress, spotifyTileAction, type DashboardCitySource } from "@/lib/dashboard-shared";
import { useServerFn } from "@tanstack/react-start";
import { CloudSun, Music2, RefreshCw, ExternalLink, LockKeyhole, Users } from "lucide-react";
import { getDashboardMusic, getDashboardWeather } from "@/lib/dashboard-widgets.functions";
import { getMyVisitStats } from "@/lib/visits.functions";
import { Button } from "@/components/ui/button";

const MUSIC_REASON: Record<string, string> = {
  not_connected: "Spotify is nog niet gekoppeld aan je ROUT-profiel.",
  not_configured: "Spotify is op deze server nog niet ingesteld.",
  not_playing: "Gepauzeerd.",
  unauthorized: "De Spotify-toegang is verlopen of ingetrokken. Koppel opnieuw.",
  rate_limited: "Spotify vraagt even te wachten.",
  forbidden: "Spotify weigert dit account. Controleer de app-toegang in Spotify.",
  no_content: "Er speelt nu niets.",
  unavailable: "Spotify is even niet bereikbaar.",
};

export function DashboardMusic({ userId }: { userId: string }) {
  const load = useServerFn(getDashboardMusic);
  // react-query pauses this interval while the tab is hidden (no background polling).
  const q = useQuery({ queryKey: ["dashboard-music", userId], queryFn: () => load(), staleTime: 10000, refetchInterval: 20000, retry: 1 });
  const d = q.data as { playing?: boolean; reason?: string; title?: string; artist?: string; album?: string; image?: string | null; url?: string | null; progressMs?: number; durationMs?: number; syncedAt?: number } | undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!d?.playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [d?.playing, d?.syncedAt]);
  const hasTrack = Boolean(d?.title);
  const position = d ? interpolateProgress(d, now) : 0;
  const pct = hasTrack && d?.durationMs ? Math.min(100, (position / d.durationMs) * 100) : 0;
  const action = spotifyTileAction(d?.reason);
  return <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5"><h2 className="flex items-center gap-2 text-sm"><Music2 className="size-4" />Spotify{d?.playing ? <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />Speelt nu</span> : null}</h2>
    <div className="flex min-w-0 flex-1 items-center gap-4">
      {hasTrack && d?.image ? <img src={d.image} alt={d.album ? `Albumhoes ${d.album}` : ""} width={64} height={64} className={d.playing ? "size-16 shrink-0 rounded-md object-cover shadow-sm" : "size-16 shrink-0 rounded-md object-cover opacity-60 grayscale"} /> : null}
      <div className="min-w-0 flex-1">
        <p className="break-words font-display text-2xl">{q.isPending ? "Laden…" : hasTrack ? d!.title : "Geen muziek actief"}</p>
        {hasTrack ? <p className="truncate text-sm text-muted-foreground">{d!.artist}{d!.album && d!.album !== d!.artist ? ` · ${d!.album}` : ""}{!d!.playing ? " · gepauzeerd" : ""}</p> : <p className="text-sm text-muted-foreground">{q.isError ? "Spotify is even niet bereikbaar." : MUSIC_REASON[d?.reason ?? ""] ?? ""}</p>}
        {hasTrack && d?.durationMs ? <div className="mt-2 space-y-1">
          <div role="progressbar" aria-label="Voortgang nummer" aria-valuemin={0} aria-valuemax={Math.round(d.durationMs / 1000)} aria-valuenow={Math.round(position / 1000)} className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${pct}%` }} /></div>
          <p className="flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{formatTrackTime(position)}</span><span>{formatTrackTime(d.durationMs)}</span></p>
        </div> : null}
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" title="Muziekstatus vernieuwen" aria-label="Muziekstatus vernieuwen" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "size-4 animate-spin" : "size-4"} /></Button>
      {action === "manage" ? <Button asChild variant="outline" size="sm"><a href={d?.url ?? "https://open.spotify.com"} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Open Spotify</a></Button> : null}
      {/* Same Live Presence link as the Studio and Hub: one connection, reused everywhere. */}
      <Button asChild variant={action === "manage" ? "ghost" : "default"} size="sm"><a href={action === "manage" ? "/studio" : "/api/spotify/start"}>{action === "connect" ? "Spotify koppelen" : action === "reconnect" ? "Opnieuw koppelen" : "Koppeling beheren"}</a></Button></div>
  </section>;
}

type WeatherResult = Awaited<ReturnType<typeof getDashboardWeather>>;

const CITY_SOURCE: Record<DashboardCitySource, string> = {
  dashboard: "Eigen dashboardlocatie",
  widget: "Uit je weer/klok/kaart-widget",
  profile: "Uit je profiellocatie",
  none: "",
};

/** Uses the profile's city unless a dashboard-only city was set via the pencil in Customize mode. */
export function DashboardWeather({ city, source = "dashboard" }: { city: string | null; source?: DashboardCitySource }) {
  const load = useServerFn(getDashboardWeather);
  const q = useQuery<WeatherResult>({ queryKey: ["dashboard-weather", city], enabled: !!city, queryFn: () => load({ data: { city: city! } }), staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: 1 });
  const r = q.data;
  return <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5"><h2 className="flex items-center gap-2 text-sm"><CloudSun className="size-4" />Weer</h2>
    <div aria-live="polite" className="flex-1">{!city ? <p className="text-sm text-muted-foreground">Nog geen locatie. Zet een stad op je profiel (locatie of weer-widget), of klik op <strong>Aanpassen</strong> en het potloodje op deze tegel.</p> : q.isPending ? <p>Laden…</p> : r?.ok ? <><p className="font-display text-4xl">{Math.round(r.temperature_2m)} °C</p><p className="text-sm">{r.city}{r.country ? ` · ${r.country}` : ""}</p><p className="text-xs text-muted-foreground">Wind {r.wind_speed_10m} km/h · Open-Meteo{CITY_SOURCE[source] ? ` · ${CITY_SOURCE[source]}` : ""}</p></> : <p className="text-sm text-muted-foreground">{r && !r.ok && r.error === "city_not_found" ? "Stad niet gevonden. Pas de locatie aan." : "Weer momenteel niet beschikbaar."}</p>}</div>
  </section>;
}

export function DashboardVisitors({ userId }: { userId: string }) {
  const load = useServerFn(getMyVisitStats);
  const q = useQuery({ queryKey: ["dashboard-visitors", userId], queryFn: () => load({ data: { days: 30, space: "all" } }), staleTime: 60000, retry: false });
  return <section className="acrylic-card flex min-w-0 flex-col gap-3 p-5"><h2 className="flex items-center gap-2 text-sm"><Users className="size-4" />Bezoekers</h2><p className="font-display text-3xl">{q.data ? q.data.total : "—"}</p><p className="text-xs text-muted-foreground">{q.isError ? "Statistieken niet beschikbaar." : "Laatste 30 dagen"}</p>{q.data && <p className="text-sm">{q.data.unique} unieke bezoekers</p>}<Button asChild variant="outline" size="sm"><a href="/dashboard/assets">Statistieken</a></Button></section>;
}

export function UpcomingDashboardWidget({ title }: { title: string }) {
  return <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5"><h2 className="flex items-center gap-2 text-sm"><LockKeyhole className="size-4" />{title}</h2><p className="font-display text-2xl">Coming soon</p></section>;
}