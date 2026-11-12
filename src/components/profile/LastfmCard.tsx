import { useQuery } from "@tanstack/react-query";
import { useLiveFresh } from "@/hooks/useLiveFresh";
import { useTranslation } from "react-i18next";
import { proxied } from "@/lib/image-proxy-rules";
import { LASTFM_IDLE, type LastfmStatus } from "@/lib/integrations/lastfm";

type Theme = { card: string; border: string; text: string; muted: string };

/** "Luistert nu" card with a CSS equalizer; shown only while a track is scrobbling. */
export function LastfmCard({ handle, theme }: { handle: string; theme: Theme }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["lastfm", handle],
    queryFn: async (): Promise<LastfmStatus> => {
      const r = await fetch(`/api/public/lastfm/${encodeURIComponent(handle)}`);
      return r.ok ? r.json() : LASTFM_IDLE;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  const fresh = useLiveFresh("lastfm", q.dataUpdatedAt);
  const d = fresh ? q.data : undefined;
  if (!d?.playing) return null;
  const art = proxied(d.art);
  const body = (
    <>
      {art && <img src={art} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />}
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-xs" style={{ color: theme.muted }}>{t("lastfm.now")}</p>
        <p className="truncate text-sm font-medium">{d.track}{d.artist ? ` – ${d.artist}` : ""}</p>
      </div>
      <span className="rout-eq" aria-hidden><i /><i /><i /><i /></span>
    </>
  );
  const cls = "mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-3 py-2.5";
  const style = { background: theme.card, borderColor: theme.border, color: theme.text };
  return d.url ? (
    <a href={d.url} target="_blank" rel="noopener noreferrer" className={cls} style={style} aria-label={`${t("lastfm.label")}: ${d.track}${d.artist ? ` – ${d.artist}` : ""}`}>{body}</a>
  ) : (
    <div className={cls} style={style} aria-live="polite">{body}</div>
  );
}
