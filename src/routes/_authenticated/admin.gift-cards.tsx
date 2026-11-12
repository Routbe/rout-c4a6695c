import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminGiftCards";

export const Route = createFileRoute("/_authenticated/admin/gift-cards")({
  head: () => ({
    meta: [
      { title: "Cadeaubon-verzending | ROUT" },
      {
        name: "description",
        content: "Beheer fysieke cadeaubonnen: drukken, inpakken en verzenden binnen België.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Cadeaubon-verzending | ROUT" },
      {
        property: "og:description",
        content: "Beheer fysieke cadeaubonnen: drukken, inpakken en verzenden binnen België.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
