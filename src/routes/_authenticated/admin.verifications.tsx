import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminVerificationRequests";

export const Route = createFileRoute("/_authenticated/admin/verifications")({
  head: () => ({
    meta: [
      { title: "Bedrijf & influencer | ROUT beheer" },
      {
        name: "description",
        content: "Manuele goedkeuring van bedrijfs- en influencerverificaties.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Bedrijf & influencer | ROUT beheer" },
      {
        property: "og:description",
        content: "Manuele goedkeuring van bedrijfs- en influencerverificaties.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
