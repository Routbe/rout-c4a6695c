import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ExploreGallery } from "@/components/explore/ExploreGallery";
import { AvatarMarquee, ReviewsStrip } from "@/components/community/Community";
import { listShowcaseCards } from "@/lib/showcase.functions";
import { listApprovedReviews } from "@/lib/community.functions";
import { useTranslation } from "react-i18next";
import { pageMeta } from "@/lib/page-cards";
import { getRequestLocale } from "@/lib/locale.functions";

export const Route = createFileRoute("/explore")({
  loader: async () => {
    const [cards, reviews, { locale }] = await Promise.all([
      listShowcaseCards(),
      listApprovedReviews().catch(() => []),
      getRequestLocale().catch(() => ({ locale: "en" as const })),
    ]);
    return { cards, reviews, locale };
  },
  head: ({ loaderData }) => ({ meta: pageMeta("explore", loaderData?.locale) }),
  component: ExplorePage,
});

function ExplorePage() {
  const { cards, reviews } = Route.useLoaderData();
  const { t } = useTranslation();
  return (
    <AppLayout crumbs={[{ label: t("explore.crumb") }]}>
      <div className="mx-auto max-w-6xl px-4 py-12 pb-28 sm:px-6 sm:py-20">
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute -top-20 left-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <span className="eyebrow">{t("explore.eyebrow")}</span>
          <h1 className="relative mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {t("explore.title")}
          </h1>
          <p className="relative mt-4 max-w-2xl text-lg text-muted-foreground">{t("explore.body")}</p>
        </section>

        {cards.length > 0 && (
          <section className="mt-12">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("explore.streamTitle")}</p>
            <AvatarMarquee cards={cards} />
          </section>
        )}

        <section className="mt-12">
          <h2 className="mb-6 font-serif text-2xl font-semibold text-foreground sm:text-3xl">{t("explore.featuredTitle")}</h2>
          <ExploreGallery cards={cards} filters />
        </section>

        <div className="mt-16">
          <ReviewsStrip reviews={reviews} />
        </div>

        <div className="mt-14 text-center">
          <Link to="/tour" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-foreground px-8 font-semibold text-background transition-opacity hover:opacity-90">
            {t("explore.cta")} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
