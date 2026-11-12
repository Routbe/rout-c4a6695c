import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { getPublicTimeline } from "@/lib/public-timeline.functions";
import type { TimelineItem } from "@/lib/public-timeline";

const KIND_ICON: Record<string, string> = {
  badge: "🏅",
  certificate: "📜",
  status: "●",
  milestone: "◆",
  social_post: "✦",
  social_follow: "＋",
};

/** Openbare chronologische tijdlijn (nieuwste eerst). Rendert niets als leeg. */
export function ProfileTimeline({
  userId,
  theme,
}: {
  userId: string;
  theme: { text: string; muted: string; border: string };
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<TimelineItem[]>([]);
  useEffect(() => {
    if (!userId || userId === "draft") return;
    let cancelled = false;
    getPublicTimeline({ data: { userId } })
      .then((r) => !cancelled && setItems(r as TimelineItem[]))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (items.length === 0) return null;
  return (
    <section className="mt-6 w-full" aria-label={t("profile.timelineLabel")}>
      <p
        className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: theme.muted }}
      >
         {t("profile.timelineLabel")} </p>
      <ol className="space-y-2 border-l pl-4" style={{ borderColor: theme.border }}>
        {items.map((it) => (
          <li key={it.id} className="text-xs" style={{ color: theme.text }}>
            <span aria-hidden className="mr-1.5">{KIND_ICON[it.kind] ?? "•"}</span>
            {it.title}
            {it.detail && <span style={{ color: theme.muted }}> — {it.detail}</span>}
            <time className="ml-2" style={{ color: theme.muted }} dateTime={it.occurred_at}>
              {new Date(it.occurred_at).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
