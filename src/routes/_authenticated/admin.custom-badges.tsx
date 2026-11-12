import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminCustomBadges";

export const Route = createFileRoute("/_authenticated/admin/custom-badges")({
  head: () => ({
    meta: [
      { title: "Eigen badges | ROUT beheer" },
      { name: "description", content: "Familiewapens en bedrijfsemblemen aanmaken, toekennen en intrekken." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Eigen badges | ROUT beheer" },
      { property: "og:description", content: "Familiewapens en bedrijfsemblemen aanmaken, toekennen en intrekken." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
