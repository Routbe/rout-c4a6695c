import { createFileRoute } from "@tanstack/react-router";
import { getPublicFeedback } from "@/lib/feedback.functions";
import { FeedbackPage } from "@/components/profile/FeedbackPage";
import { profilePreviewPath } from "@/lib/profile-preview";
export const Route = createFileRoute("/u/$username_/feedback")({
  loader: ({ params }) => getPublicFeedback({ data: { space: "alias", handle: params.username } }),
  head: ({ params }) => ({ meta: [{ title: `Feedback voor @${params.username} | ROUT` }, { name: "description", content: "Laat je ervaring achter bij dit ROUT-aliasprofiel." }, { property: "og:title", content: `Feedback voor @${params.username} | ROUT` }, { property: "og:description", content: "Beoordelingen en reacties voor dit aliasprofiel." }, { property: "og:type", content: "website" }, { property: "og:image", content: `https://rout.be${profilePreviewPath(params.username, "alias")}` }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }, { name: "twitter:card", content: "summary_large_image" }, { name: "twitter:image", content: `https://rout.be${profilePreviewPath(params.username, "alias")}` }] }),
  component: () => <FeedbackPage items={Route.useLoaderData()} />,
});