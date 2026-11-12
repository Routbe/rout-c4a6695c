import { createFileRoute } from "@tanstack/react-router";
import Donate from "@/components/imported-pages/TipPage";
import { canonicalLinks, donateJsonLd } from "@/lib/social-meta";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { shareCardMeta } from "@/lib/og-action-card";

export const Route = createFileRoute("/u/$username_/donate")({
  validateSearch: (search: Record<string, unknown>) => ({
    donation: typeof search["donation"] === "string" ? (search["donation"] as string) : undefined,
    status: typeof search["status"] === "string" ? (search["status"] as string) : undefined,
  }),
  head: ({ params }) => {
    const handle = sanitizeHandleInput(params.username);
    const title = `Steun @${handle} — ROUT`;
    const description = `Geef @${handle} rechtstreekse steun via ROUT: kies een bedrag en scan de betaal-QR met je eigen bank-app.`;
    const path = `/u/${handle}/donate`;
    return {
      links: canonicalLinks(path),
      scripts: donateJsonLd({ handle, url: `https://rout.be${path}` }),
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        ...shareCardMeta(handle, "donate", "nl", "alias"),
      ],
    };
  },
  component: Donate,
});
