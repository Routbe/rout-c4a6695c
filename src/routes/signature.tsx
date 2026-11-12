import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Signature";

const title = "E-mailhandtekening generator | ROUT";
const description =
  "Maak een strakke HTML-e-mailhandtekening voor Infomaniak: tabelgebaseerd, inline CSS, met micro QR of avatar en link-in-bio badge.";

export const Route = createFileRoute("/signature")({
  head: () => ({
    meta: [...pathCardMeta("/signature", "nl"), 
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
