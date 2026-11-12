import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Tour";

export const Route = createFileRoute("/tour")({
  head: () => ({
    meta: [...pathCardMeta("/tour", "nl"), 
      { title: "Rondleiding — bouw je ROUT-profiel" },
      {
        name: "description",
        content:
          "Ontdek ROUT in vier stappen: kies je handle, schrijf je bio, kies je thema en bewaar alles met één magic link.",
      },
      { property: "og:title", content: "Rondleiding — bouw je ROUT-profiel" },
      {
        property: "og:description",
        content:
          "Ontdek ROUT in vier stappen: kies je handle, schrijf je bio, kies je thema en bewaar alles met één magic link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
