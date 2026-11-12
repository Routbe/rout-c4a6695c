import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminBrands";

export const Route = createFileRoute("/_authenticated/admin/brands")({
  head: () => ({
    meta: [
      { title: "Beschermde namen | ROUT" },
      { name: "description", content: "Geef beschermde merknamen vrij na verificatie." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Beschermde namen | ROUT" },
      { property: "og:description", content: "Geef beschermde merknamen vrij na verificatie." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
