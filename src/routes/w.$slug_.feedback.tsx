import { createFileRoute } from "@tanstack/react-router";
import { getPublicFeedback } from "@/lib/feedback.functions";
import { FeedbackPage } from "@/components/profile/FeedbackPage";
import { profilePreviewPath } from "@/lib/profile-preview";
export const Route = createFileRoute("/w/$slug_/feedback")({
  loader: ({ params }) => getPublicFeedback({ data: { space: "workspace", handle: params.slug } }),
  head: ({ params }) => ({ meta: [{ title: `Workspacefeedback · ${params.slug} | ROUT` }, { name: "description", content: "Deel je ervaring met deze ROUT-workspace." }, { property: "og:title", content: `Workspacefeedback · ${params.slug} | ROUT` }, { property: "og:description", content: "Beoordelingen en reacties voor deze workspace." }, { property: "og:type", content: "website" }, { property: "og:image", content: `https://rout.be${profilePreviewPath(params.slug, "workspace")}` }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }, { name: "twitter:card", content: "summary_large_image" }, { name: "twitter:image", content: `https://rout.be${profilePreviewPath(params.slug, "workspace")}` }] }),
  component: () => <FeedbackPage items={Route.useLoaderData()} />,
});