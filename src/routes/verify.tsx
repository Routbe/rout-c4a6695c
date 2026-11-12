import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/VerifyGuide";
import { canonicalLinks } from "@/lib/social-meta";

const TITLE = "Verificatie bij ROUT — blauw vinkje en privacyschild";
const DESCRIPTION =
  "Hoe ROUT je identiteit controleert via je bank of eID, wat het privacyschild betekent en welke gegevens we wél en niet bewaren.";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [...pathCardMeta("/verify", "nl"), 
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rout.be/verify" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: canonicalLinks("/verify"),
  }),
  component: Page,
});
