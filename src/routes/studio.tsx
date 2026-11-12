import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Studio";
import QrGenerator from "@/components/imported-pages/Index";

/**
 * /studio — de exclusieve werkplaats voor creatie.
 * Standaard de Profile Hub builder; met `?mode=qr` de volledige QR-generator
 * (publiek toegankelijk, net als voorheen op `/` en `/qr`).
 */
export const Route = createFileRoute("/studio")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "qr" ? ("qr" as const) : undefined,
    type: typeof search["type"] === "string" ? (search["type"] as string) : undefined,
    url: typeof search["url"] === "string" ? (search["url"] as string) : undefined,
    workspace: typeof search["workspace"] === "string" ? (search["workspace"] as string) : undefined,
  }),
  head: () => ({
    meta: [...pathCardMeta("/studio", "nl"), 
      { title: "Studio — creatie & profielhub | ROUT" },
      {
        name: "description",
        content:
          "De ROUT-werkplaats: ontwerp dynamische QR-codes en bouw je soevereine link-in-bio profielhub.",
      },
      { property: "og:title", content: "Studio — creatie & profielhub | ROUT" },
      {
        property: "og:description",
        content:
          "De ROUT-werkplaats: ontwerp dynamische QR-codes en bouw je soevereine link-in-bio profielhub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { mode } = Route.useSearch();
  if (mode === "qr") return <QrGenerator />;
  return <Page />;
}
