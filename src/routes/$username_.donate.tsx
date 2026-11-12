import { createFileRoute } from "@tanstack/react-router";
import Donate from "@/components/imported-pages/TipPage";
import { canonicalLinks, donateJsonLd } from "@/lib/social-meta";
import { shareCardMeta } from "@/lib/og-action-card";

/** Schone wortel-URL voor geverifieerde leden: rout.be/<naam>/donate */
export const Route = createFileRoute("/$username_/donate")({
  validateSearch: (search: Record<string, unknown>) => ({
    donation: typeof search["donation"] === "string" ? (search["donation"] as string) : undefined,
    status: typeof search["status"] === "string" ? (search["status"] as string) : undefined,
  }),
  head: ({ params }) => {
    const handle = (params.username ?? "").replace(/^@/, "");
    const title = `Steun @${handle} — ROUT`;
    const description = `Geef @${handle} rechtstreekse steun via ROUT: kies een bedrag en scan de betaal-QR met je eigen bank-app.`;
    const path = `/${handle}/donate`;
    return {
      links: canonicalLinks(path),
      scripts: donateJsonLd({ handle, url: `https://rout.be${path}` }),
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: `https://rout.be${path}` },
        ...shareCardMeta(handle, "donate", "nl"),
      ],
    };
  },
  component: Donate,
});
