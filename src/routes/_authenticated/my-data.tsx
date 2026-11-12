import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/MyData";

export const Route = createFileRoute("/_authenticated/my-data")({
  head: () => ({
    meta: [
      { title: "Mijn gegevens | ROUT" },
      {
        name: "description",
        content: "Download alles wat ROUT van je bewaart of verwijder je account en gegevens.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Mijn gegevens | ROUT" },
      {
        property: "og:description",
        content: "Download alles wat ROUT van je bewaart of verwijder je account en gegevens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
