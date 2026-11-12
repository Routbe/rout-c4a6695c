import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminSubdomains";

export const Route = createFileRoute("/_authenticated/admin/subdomains")({
  head: () => ({
    meta: [
      { title: "Root-subdomeinen | ROUT beheer" },
      {
        name: "description",
        content: "Audit-log van root-subdomein claims, mailstatus en DNS-activatie.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Root-subdomeinen | ROUT beheer" },
      {
        property: "og:description",
        content: "Audit-log van root-subdomein claims, mailstatus en DNS-activatie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
