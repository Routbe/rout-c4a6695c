import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Batch";

export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [...pathCardMeta("/batch", "nl"), 
      { title: "Batch QR-generator | ROUT" },
      {
        name: "description",
        content: "Genereer honderden QR-codes in één keer vanuit een CSV en download ze als ZIP.",
      },
      { property: "og:title", content: "Batch QR-generator | ROUT" },
      {
        property: "og:description",
        content: "Genereer honderden QR-codes in één keer vanuit een CSV en download ze als ZIP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
