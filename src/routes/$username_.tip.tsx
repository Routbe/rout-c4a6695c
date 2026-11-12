import { createFileRoute } from "@tanstack/react-router";
import Donate from "@/components/imported-pages/TipPage";
import { canonicalLinks, donateJsonLd } from "@/lib/social-meta";
import { shareCardMeta } from "@/lib/og-action-card";

/** Fooi-variant op de schone wortel-URL: rout.be/<handle>/tip */
export const Route = createFileRoute("/$username_/tip")({
  validateSearch: (search: Record<string, unknown>) => ({
    donation: typeof search["donation"] === "string" ? (search["donation"] as string) : undefined,
    status: typeof search["status"] === "string" ? (search["status"] as string) : undefined,
  }),
  head: ({ params }) => {
    const handle = (params.username ?? "").replace(/^@/, "");
    const title = `Geef een fooi aan @${handle} — ROUT`;
    const description = `Steun @${handle} met een fooi: kies een bedrag en scan de betaal-QR met je bank-app.`;
    const path = `/${handle}/tip`;
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
        ...shareCardMeta(handle, "tip", "nl"),
      ],
    };
  },
  component: Donate,
});
