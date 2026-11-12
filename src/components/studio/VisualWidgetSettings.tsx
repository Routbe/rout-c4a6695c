import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BLOCK_SIZES, type BlockSize } from "@/lib/profile";
import {
  checkWidgetUrl,
  countdownDays,
  LOCATION_WIDGETS,
  parseWidgetConfig,
  serializeWidgetConfig,
  type VisualWidgetKind,
  type WidgetConfig,
  type WidgetPlace,
} from "@/lib/profile-widgets";
import { searchWidgetPlaces } from "@/lib/visual-widgets.functions";

interface Props {
  kind: VisualWidgetKind;
  label: string;
  value: string;
  size?: BlockSize | undefined;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
  onSize?: (size: BlockSize | undefined) => void;
  /** City already used by another location widget. */
  sharedPlace?: WidgetPlace | null;
  /** City from the profile's location badge. */
  profileCity?: string | null;
  /** Picking a city also fills the other location widgets that have none. */
  onPlace?: (place: WidgetPlace) => void;
}

/** Settings panel for one visual widget. */
export function VisualWidgetSettings({ kind, label, value, size, onChange, onTitle, onSize, sharedPlace, profileCity, onPlace }: Props) {
  const { t } = useTranslation();
  const config = parseWidgetConfig(value);
  const set = (patch: Partial<WidgetConfig>) => onChange(serializeWidgetConfig({ ...config, ...patch }));
  const usesPlace = (LOCATION_WIDGETS as readonly string[]).includes(kind);
  const usesUrl = kind === "wg_post" || kind === "wg_music" || kind === "wg_video" || kind === "wg_photo";

  return (
    <div className="space-y-3">
      <Input aria-label={t("studio.vw.title")} placeholder={t("studio.vw.title")} value={label} maxLength={100} onChange={(e) => onTitle(e.target.value)} />

      {usesPlace && (
        <PlacePicker
          place={config.place ?? null}
          sharedPlace={sharedPlace ?? null}
          profileCity={profileCity ?? null}
          onPick={(place) => (onPlace ? onPlace(place) : set({ place }))}
        />
      )}

      {kind === "wg_map" && config.place && (
        <label className="block space-y-2 text-xs text-muted-foreground">
          {t("studio.vw.zoom", { level: config.zoom ?? 10 })}
          <Slider min={3} max={13} step={1} value={[config.zoom ?? 10]} onValueChange={([z]) => set({ zoom: z })} aria-label={t("studio.vw.zoomLabel")} />
          <span className="flex justify-between text-[10px]"><span>{t("studio.vw.zoomFar")}</span><span>{t("studio.vw.zoomNear")}</span></span>
        </label>
      )}

      {kind === "wg_clock" && (
        <label className="flex items-center justify-between gap-3 text-sm">
          {t("studio.vw.hour12")}
          <Switch checked={Boolean(config.hour12)} onCheckedChange={(v) => set({ hour12: v })} />
        </label>
      )}

      {usesUrl && <UrlField kind={kind} url={config.url ?? ""} onUrl={(url) => set({ url })} />}

      {kind === "wg_photo" && (
        <Input placeholder={t("studio.vw.caption")} aria-label={t("studio.vw.caption")} value={config.caption ?? ""} maxLength={200} onChange={(e) => set({ caption: e.target.value })} />
      )}

      {kind === "wg_birthday" && <CountdownFields config={config} set={set} />}

      {kind === "wg_text" && (
        <div className="space-y-1">
          <Textarea rows={5} maxLength={2000} value={config.text ?? ""} onChange={(e) => set({ text: e.target.value })} aria-label={t("studio.vw.text")} placeholder={t("studio.vw.textPlaceholder")} />
          <p className="text-[11px] text-muted-foreground">{t("studio.vw.textHelp")}</p>
        </div>
      )}

      {onSize && (
        <div className="space-y-1.5 rounded-xl border border-border/60 bg-background p-3">
          <p className="text-[11px] font-medium text-foreground">{t("studio.vw.size")}</p>
          <div role="radiogroup" aria-label={t("studio.vw.size")} className="flex flex-wrap gap-1.5">
            {([undefined, ...BLOCK_SIZES] as const).map((s) => {
              const active = size === s;
              return (
                <button
                  key={s ?? "row"}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSize(s)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t(`studio.vw.sizes.${s ?? "row"}`)}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">{t("studio.vw.sizeHelp")}</p>
        </div>
      )}
    </div>
  );
}

function PlacePicker({ place, sharedPlace, profileCity, onPick }: { place: WidgetPlace | null; sharedPlace: WidgetPlace | null; profileCity: string | null; onPick: (p: WidgetPlace) => void }) {
  const { t } = useTranslation();
  const search = useServerFn(searchWidgetPlaces);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WidgetPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (q: string, pickFirst = false) => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await search({ data: { query: q.trim() } });
      if (!res.ok) setError(t("studio.vw.placeUnavailable"));
      else if (res.places.length === 0) setError(t("studio.vw.placeNotFound"));
      else if (pickFirst) { onPick(res.places[0]!); setResults([]); }
      else setResults(res.places);
    } catch {
      setError(t("studio.vw.placeUnavailable"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const id = window.setTimeout(() => void run(query), 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden />{t("studio.vw.place")}</p>
      {place ? (
        <p className="text-sm">{place.name}{place.country ? <span className="text-muted-foreground"> · {place.country}</span> : null} <span className="text-[11px] text-muted-foreground">({place.timezone})</span></p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("studio.vw.placeMissing")}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {sharedPlace && sharedPlace.name !== place?.name && (
          <Button type="button" size="sm" variant="outline" onClick={() => onPick(sharedPlace)}>
            <Check className="h-3.5 w-3.5" aria-hidden /> {t("studio.vw.useShared", { city: sharedPlace.name })}
          </Button>
        )}
        {profileCity && profileCity.split(",")[0]!.trim() !== place?.name && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(profileCity.split(",")[0]!.trim(), true)}>
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {t("studio.vw.useProfileCity", { city: profileCity })}
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("studio.vw.placeSearch")} aria-label={t("studio.vw.placeSearch")} maxLength={80} />
        {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      {results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" role="listbox" aria-label={t("studio.vw.placeSearch")}>
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button type="button" role="option" aria-selected={false} className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { onPick(r); setResults([]); setQuery(""); }}>
                {r.name}{r.country ? <span className="text-muted-foreground"> · {r.country}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">{t("studio.vw.placePrivacy")}</p>
    </div>
  );
}

function UrlField({ kind, url, onUrl }: { kind: VisualWidgetKind; url: string; onUrl: (url: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  const check = checkWidgetUrl(kind, draft);
  return (
    <div className="space-y-1">
      <Input
        type="url"
        inputMode="url"
        value={draft}
        maxLength={500}
        placeholder={t(`studio.vw.urlPlaceholder.${kind}`)}
        aria-label={t("studio.vw.url")}
        aria-invalid={check === "not_https" || check === "unsupported"}
        onChange={(e) => {
          const next = e.target.value.trim();
          setDraft(next);
          if (checkWidgetUrl(kind, next) === "ok") onUrl(next);
        }}
      />
      <p role={check === "ok" || check === "empty" ? undefined : "alert"} className={cn("text-[11px]", check === "ok" ? "text-foreground" : check === "empty" ? "text-muted-foreground" : "text-destructive")}>
        {check === "ok" ? `✓ ${t("studio.vw.urlOk")}` : t(`studio.vw.urlCheck.${check}`, { kind: t(`studio.vw.kind.${kind}`) })}
      </p>
      <p className="text-[10px] text-muted-foreground">{t(`studio.vw.urlHelp.${kind}`)}</p>
    </div>
  );
}

function CountdownFields({ config, set }: { config: WidgetConfig; set: (patch: Partial<WidgetConfig>) => void }) {
  const { t } = useTranslation();
  const mode = config.mode ?? "birthday";
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const days = now ? countdownDays(config, now) : null;
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={t("studio.vw.countdownMode")} className="inline-flex overflow-hidden rounded-lg border border-border text-[11px]">
        {(["birthday", "event"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => set({ mode: m })} className={cn("px-3 py-1.5 transition-colors", mode === m ? "bg-foreground text-background" : "hover:bg-muted")}>
            {t(`studio.vw.mode.${m}`)}
          </button>
        ))}
      </div>
      <Input type="date" value={config.date ?? ""} onChange={(e) => set({ date: e.target.value })} aria-label={t("studio.vw.date")} className="input-field h-11 rounded-xl" />
      {days !== null && <p className="text-[11px] text-muted-foreground">{days < 0 ? t("studio.vw.datePast") : t("studio.vw.daysLeft", { count: days })}</p>}
      {mode === "birthday" && <p className="text-[10px] text-muted-foreground">{t("studio.vw.birthdayPrivacy")}</p>}
    </div>
  );
}
