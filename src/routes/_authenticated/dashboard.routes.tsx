import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/RoutesManager";

export const Route = createFileRoute("/_authenticated/dashboard/routes")({
  head: () => ({
    meta: [
      { title: "Links beheren | ROUT" },
      { name: "description", content: "Beheer je ROUT-account, links en QR-codes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Links beheren | ROUT" },
      { property: "og:description", content: "Beheer je ROUT-account, links en QR-codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
