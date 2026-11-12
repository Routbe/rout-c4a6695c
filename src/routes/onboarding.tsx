import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Onboarding";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Onboarding — zet je ROUT-profiel op | ROUT" },
      {
        name: "description",
        content:
          "Claim je handle, kies je thema en zet in vier stappen je soevereine ROUT-profiel live.",
      },
      { property: "og:title", content: "Onboarding — zet je ROUT-profiel op | ROUT" },
      {
        property: "og:description",
        content:
          "Claim je handle, kies je thema en zet in vier stappen je soevereine ROUT-profiel live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});
