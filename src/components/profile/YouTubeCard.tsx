import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { proxied } from "@/lib/image-proxy-rules";
import { formatCount, type YouTubeCard as Card } from "@/lib/youtube-format";

type Theme = { card: string; border: string; text: string; muted: string };

/** Presentational YouTube channel card (profile + Studio preview). */
export function YouTubeCardView({ card, theme, cardStyle, live }: { card: Card; theme: Theme; cardStyle?: CSSProperties; live?: { videoId: string; title: string } | null }) {
  const { t } = useTranslation();
  const avatar = proxied(card.avatar);
  return (
    <div
      className="w-full rounded-2xl border p-4 text-left"
      style={{ background: theme.card, borderColor: theme.border, color: theme.text, ...cardStyle }}
    >
      {live && (
        <a
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(live.videoId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 flex items-center gap-2 text-xs font-semibold"
        >
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: YT_RED }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: YT_RED }} />
          </span>
          <span style={{ color: YT_RED }}>LIVE NOW</span>
          <span className="truncate" style={{ color: theme.muted }}>{live.title}</span>
        </a>
      )}
      <a href={card.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
        {avatar ? (
          <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-full" style={{ background: theme.border }} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{card.title}</p>
          <p className="text-xs" style={{ color: theme.muted }}>
            {card.subscribers != null && <>{formatCount(card.subscribers)}  {t("profile.subscribersSuffix")} </>}
            {formatCount(card.views)}  {t("profile.views")} {card.videoCount != null && <> · {formatCount(card.videoCount)}  {t("profile.videos")} </>}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: theme.muted }}><YouTubeMark /> ↗</span>
      </a>
      {card.videos.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {card.videos.map((v) => {
            const thumb = proxied(v.thumb);
            return (
              <li key={v.id}>
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="block">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="aspect-video w-full rounded-lg object-cover"
                    />
                  ) : (
                    <span className="block aspect-video w-full rounded-lg" style={{ background: theme.border }} />
                  )}
                  <span className="mt-1 line-clamp-2 block text-xs">{v.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Brand accent: only the YouTube logo keeps its own red. */
const YT_RED = "#FF0000";
function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-label="YouTube" role="img">
      <path fill={YT_RED} d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z" />
      <path fill="currentColor" d="m9.6 15.6 6.3-3.6-6.3-3.6v7.2Z" />
    </svg>
  );
}

/** Public profile card: renders nothing unless the member linked and enabled it. */
export function ProfileYouTubeCard({ handle, theme, cardStyle }: { handle: string; theme: Theme; cardStyle?: CSSProperties }) {
  const q = useQuery({
    queryKey: ["youtube-card", handle],
    queryFn: async (): Promise<{ card: Card | null; live: { videoId: string; title: string } | null } | null> => {
      const r = await fetch(`/api/public/youtube/card?handle=${encodeURIComponent(handle)}`);
      if (!r.ok) return null;
      const j = (await r.json()) as { card: Card | null; live?: { videoId: string; title: string } | null };
      return { card: j.card, live: j.live ?? null };
    },
    staleTime: 5 * 60_000,
  });
  if (!q.data?.card) return null;
  return <YouTubeCardView card={q.data.card} theme={theme} cardStyle={cardStyle} live={q.data.live} />;
}
