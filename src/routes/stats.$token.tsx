import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Stats";

export const Route = createFileRoute("/stats/$token")({
  head: () => ({
    meta: [
      { title: "Gedeelde statistieken | ROUT" },
      { name: "description", content: "Openbaar gedeelde, cookieloze statistieken van een ROUT-link." },
      { property: "og:title", content: "Gedeelde statistieken | ROUT" },
      { property: "og:description", content: "Openbaar gedeelde, cookieloze statistieken van een ROUT-link." },
      { property: "og:image", content: "https://rout.be/brand/og/home-nl.png?v=3" },
      { name: "twitter:image", content: "https://rout.be/brand/og/home-nl.png?v=3" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});
