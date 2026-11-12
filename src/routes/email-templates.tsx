import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/EmailTemplates";

const title = "E-mailtemplates generator | ROUT";
const description =
  "Twee schone HTML-e-mailtemplates in ROUT-huisstijl: persoonlijk en team. Tabelgebaseerd met inline CSS, klaar voor Infomaniak Mail.";

export const Route = createFileRoute("/email-templates")({
  head: () => ({
    meta: [...pathCardMeta("/email-templates", "nl"), 
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
