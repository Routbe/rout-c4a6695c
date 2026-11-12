import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Manifesto";

export const Route = createFileRoute("/manifesto")({
  head: () => ({
    meta: [...pathCardMeta("/manifesto", "nl"), 
      { title: "Manifesto | ROUT" },
      {
        name: "description",
        content: "Waar ROUT voor staat: eigenaarschap van je links, privacy en open technologie.",
      },
      { property: "og:title", content: "Manifesto | ROUT" },
      {
        property: "og:description",
        content: "Waar ROUT voor staat: eigenaarschap van je links, privacy en open technologie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
