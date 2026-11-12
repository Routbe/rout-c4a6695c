import { createFileRoute, notFound } from "@tanstack/react-router";
import { TopicLanding } from "@/components/discover/TopicLanding";
import { getRequestLocale } from "@/lib/locale.functions";
import { discoverCopy } from "@/lib/discover/copy";
import { isTopicSlug, TOPIC_CARD_ACCENT, topicCardImage } from "@/lib/discover/topics";
import { canonicalLinks } from "@/lib/social-meta";

export const Route = createFileRoute("/discover/$topic")({
  loader: async ({ params }) => {
    if (!isTopicSlug(params.topic)) throw notFound();
    const { locale } = await getRequestLocale().catch(() => ({ locale: "en" as const }));
    return { locale, slug: params.topic };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Pagina niet gevonden | ROUT" }, { name: "robots", content: "noindex" }] };
    const c = discoverCopy(loaderData.locale).topics[loaderData.slug];
    const title = `${c.brand}: ${c.title}`;
    return {
      meta: [
        { title },
        { name: "description", content: c.lead },
        { property: "og:title", content: title },
        { property: "og:description", content: c.lead },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `https://rout.be/discover/${loaderData.slug}` },
        { property: "og:image", content: topicCardImage(loaderData.slug, loaderData.locale) },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: title },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: c.lead },
        { name: "twitter:image", content: topicCardImage(loaderData.slug, loaderData.locale) },
        { name: "theme-color", content: TOPIC_CARD_ACCENT[loaderData.slug][0] },
      ],
      links: canonicalLinks(`/discover/${params.topic}`),
    };
  },
  component: TopicPage,
});

function TopicPage() {
  const { slug } = Route.useLoaderData();
  return <TopicLanding slug={slug} />;
}
