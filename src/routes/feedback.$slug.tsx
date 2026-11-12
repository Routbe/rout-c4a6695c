import { createFileRoute } from "@tanstack/react-router";
import { getPublicFeedback } from "@/lib/feedback.functions";
import { FeedbackPage } from "@/components/profile/FeedbackPage";
export const Route = createFileRoute("/feedback/$slug")({
  loader: ({ params }) => getPublicFeedback({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.[0]?.form.title ?? "Feedback"} | ROUT` },
    { name: "description", content: "Deel je ervaring rechtstreeks met deze ROUT-maker." },
    { property: "og:title", content: `${loaderData?.[0]?.form.title ?? "Feedback"} | ROUT` },
    { property: "og:description", content: "Geef een beoordeling of laat een reactie achter." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <FeedbackPage items={Route.useLoaderData()} />,
});