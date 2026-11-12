import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminContact";

export const Route = createFileRoute("/_authenticated/admin/contact")({
  head: () => ({
    meta: [
      { title: "Contactberichten | ROUT" },
      { name: "description", content: "Beheer de berichten uit het ROUT-contactformulier." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Contactberichten | ROUT" },
      { property: "og:description", content: "Beheer de berichten uit het ROUT-contactformulier." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
