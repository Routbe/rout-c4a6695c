import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import { DiscoverIndex } from "@/components/discover/DiscoverIndex";
import { getRequestLocale } from "@/lib/locale.functions";
import { discoverCopy } from "@/lib/discover/copy";
import { canonicalLinks } from "@/lib/social-meta";

export const Route = createFileRoute("/discover/")({
  loader: async () => getRequestLocale().catch(() => ({ locale: "en" as const })),
  head: ({ loaderData }) => {
    const { ui } = discoverCopy(loaderData?.locale);
    const title = `${ui.indexTitle}`;
    return {
      meta: [...pathCardMeta("/discover", loaderData?.locale ?? "nl"), 
        { title },
        { name: "description", content: ui.indexLead },
        { property: "og:title", content: title },
        { property: "og:description", content: ui.indexLead },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: canonicalLinks("/discover"),
    };
  },
  component: DiscoverIndex,
});
