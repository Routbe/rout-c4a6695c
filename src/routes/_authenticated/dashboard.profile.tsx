import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/ProfileSettings";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "Profiel | ROUT" },
      { name: "description", content: "Beheer je ROUT-account, links en QR-codes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Profiel | ROUT" },
      { property: "og:description", content: "Beheer je ROUT-account, links en QR-codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
