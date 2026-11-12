import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Claim";

export const Route = createFileRoute("/claim")({
  head: () => ({
    meta: [
      { title: "Claim je korte link | ROUT" },
      {
        name: "description",
        content: "Zet een anoniem gemaakte link of QR-code op je eigen ROUT-account.",
      },
      { property: "og:title", content: "Claim je korte link | ROUT" },
      {
        property: "og:description",
        content: "Zet een anoniem gemaakte link of QR-code op je eigen ROUT-account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
