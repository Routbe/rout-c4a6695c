import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Domains";

export const Route = createFileRoute("/_authenticated/dashboard/domains")({
  head: () => ({
    meta: [
      { title: "Domeinen | ROUT" },
      { name: "description", content: "Beheer je ROUT-account, links en QR-codes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Domeinen | ROUT" },
      { property: "og:description", content: "Beheer je ROUT-account, links en QR-codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
