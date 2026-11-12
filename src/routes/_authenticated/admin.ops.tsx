import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminOps";

export const Route = createFileRoute("/_authenticated/admin/ops")({
  head: () => ({
    meta: [
      { title: "Operations | ROUT beheer" },
      {
        name: "description",
        content: "Beheer en corrigeer short links, badges en QR-scantellers.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Operations | ROUT beheer" },
      {
        property: "og:description",
        content: "Beheer en corrigeer short links, badges en QR-scantellers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
