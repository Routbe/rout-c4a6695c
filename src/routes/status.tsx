import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/StatusPage";
import { canonicalLinks } from "@/lib/social-meta";

const TITLE = "Systeemstatus — ROUT";
const DESCRIPTION =
  "Live status van de ROUT-database, de SecureShield™ mailrelays en de betaalgateways. Gemeten zonder cookies of bezoekersprofielen.";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [...pathCardMeta("/status", "nl"), 
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rout.be/status" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: canonicalLinks("/status"),
  }),
  component: Page,
});
