import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminSepaReview";

export const Route = createFileRoute("/_authenticated/admin/sepa")({
  head: () => ({
    meta: [
      { title: "SEPA naam-controle | ROUT" },
      {
        name: "description",
        content: "Beoordeel overschrijvingen met een afwijkende naam van de betaler.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "SEPA naam-controle | ROUT" },
      {
        property: "og:description",
        content: "Beoordeel overschrijvingen met een afwijkende naam van de betaler.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
