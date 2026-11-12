import { useQuery } from "@tanstack/react-query";
import { useLiveFresh } from "@/hooks/useLiveFresh";
import { useTranslation } from "react-i18next";
import { proxied } from "@/lib/image-proxy-rules";
import { cardEffectClasses, type SteamStatus } from "@/lib/steam-presence";

type Theme = { card: string; border: string; text: string; muted: string };

/** Steam live card: shown only while the owner is actually playing. */
export function SteamCard({ handle, theme, effects }: { handle: string; theme: Theme; effects: boolean }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["steam", handle],
    queryFn: async (): Promise<SteamStatus> => {
      const r = await fetch(`/api/public/steam/${encodeURIComponent(handle)}`);
      return r.ok ? r.json() : { state: "offline", name: null, game: null, avatar: null, url: null };
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const fresh = useLiveFresh("steam", q.dataUpdatedAt);
  const d = fresh ? q.data : undefined;
  if (!d || d.state !== "in-game") return null;
  const live = d.state === "in-game";
  const avatar = proxied(d.avatar);
  const body = (
    <>
      {avatar && <img src={avatar} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />}
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{live ? d.game : t("steam.online")}</p>
        <p className="truncate text-xs" style={{ color: theme.muted }}>
          {live ? t("steam.playing", { name: d.name ?? "Steam" }) : d.name ?? "Steam"}
        </p>
      </div>
      <span className="rout-status-dot" data-live={live ? "true" : "false"} aria-hidden />
    </>
  );
  const cls = `mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-3 py-2.5 ${cardEffectClasses(effects, live)}`;
  const style = { background: theme.card, borderColor: theme.border, color: theme.text };
  return d.url ? (
    <a href={d.url} target="_blank" rel="noopener noreferrer" className={cls} style={style} aria-label={`${t("steam.label")}: ${d.name ?? "Steam"}${d.game ? ` – ${d.game}` : ""}`}>{body}</a>
  ) : (
    <div className={cls} style={style} aria-live="polite">{body}</div>
  );
}
