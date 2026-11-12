import { Link } from "@tanstack/react-router";
import { Quote } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShowcaseCard } from "@/lib/showcase.functions";
import type { CommunityReview, CommunityStats } from "@/lib/community.functions";
import { cn } from "@/lib/utils";
import { DragMarquee } from "./DragMarquee";
import { ShowcaseAvatar, ShowcaseMark, ShowcaseName } from "@/components/profile/ShowcaseIdentity";

function Avatar({ c, size = "h-10 w-10" }: { c: ShowcaseCard; size?: string }) {
  return <ShowcaseAvatar card={c} className={size} />;
}

/** Endless avatar strip moving right → left; pauses on hover, draggable. One tap opens the profile. */
export function AvatarMarquee({ cards }: { cards: ShowcaseCard[] }) {
  if (!cards.length) return null;
  const base = Array.from({ length: Math.max(1, Math.ceil(12 / cards.length)) }, () => cards).flat();
  return (
    <DragMarquee>
      {base.map((c, i) => (
        <Link
          key={`${c.handle}-${i}`}
          to="/$username"
          params={{ username: c.handle }}
          preload="intent"
          draggable={false}
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-4 transition-colors hover:border-foreground/40"
        >
          <Avatar c={c} size="h-8 w-8" />
          <span className="font-mono text-xs text-foreground">@{c.handle}</span>
          <ShowcaseMark card={c} />
        </Link>
      ))}
    </DragMarquee>
  );
}

/** Full profile cards. Plain links: a single tap/click always navigates. */
export function ProfileCardGrid({ cards }: { cards: ShowcaseCard[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.handle}
          to="/$username"
          params={{ username: c.handle }}
          preload="intent"
          className="group flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 transition-colors hover:border-foreground/40"
        >
          <div className="flex items-center gap-3">
            <Avatar c={c} size="h-14 w-14" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-serif text-lg font-semibold text-foreground">
                <ShowcaseName card={c} />
                <ShowcaseMark card={c} />
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">rout.be/{c.handle}</p>
            </div>
          </div>
          {(c.tagline || c.bio) && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{c.tagline || c.bio}</p>}
          <span className="mt-auto text-xs font-medium text-foreground">{t("explore.view")} →</span>
        </Link>
      ))}
    </div>
  );
}

export function ReviewsStrip({ reviews }: { reviews: CommunityReview[] }) {
  const { t } = useTranslation();
  if (!reviews.length) return null;
  return (
    <section aria-label={t("community.reviews.title")}>
      <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">{t("community.reviews.title")}</h2>
      <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
        {reviews.map((r) => (
          <figure key={r.id} className="w-80 shrink-0 snap-start rounded-3xl border border-border bg-card p-6">
            <Quote className="h-5 w-5 text-muted-foreground" aria-hidden />
            <blockquote className="mt-3 text-sm leading-relaxed text-foreground">{r.quote}</blockquote>
            <figcaption className="mt-4 text-xs text-muted-foreground">
              {r.authorName}
              {r.handle && <span className="font-mono"> · @{r.handle}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function CommunityMetrics({ stats }: { stats: CommunityStats | null }) {
  const { t } = useTranslation();
  if (!stats) return null;
  const items = [
    { value: stats.members, label: t("community.metrics.members") },
    { value: stats.verified, label: t("community.metrics.verified") },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((m) => (
        <div key={m.label} className="rounded-3xl border border-border bg-card p-6">
          <p className="font-serif text-4xl font-semibold tabular-nums text-foreground">{m.value.toLocaleString()}</p>
          <p className="mt-1 text-sm text-muted-foreground">{m.label}</p>
        </div>
      ))}
      <Link to="/status" className="rounded-3xl border border-border bg-card p-6 transition-colors hover:border-foreground/40">
        <p className="font-serif text-4xl font-semibold text-foreground">●</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("community.metrics.status")}</p>
      </Link>
    </div>
  );
}
