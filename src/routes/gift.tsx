import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/GiftCards";
import { OG_IMAGE, canonicalLinks } from "@/lib/social-meta";

const TITLE = "ROUT-cadeaubon — geef een rustige linkpagina cadeau";
const DESCRIPTION =
  "Koop een ROUT-cadeaubon: digitaal per mail met PDF en 3D-weergave, direct inwisselbaar bij het afrekenen, en gratis fysiek geleverd in België.";

export const Route = createFileRoute("/gift")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rout.be/gift" },
      { property: "og:image", content: `https://rout.be${OG_IMAGE}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `https://rout.be${OG_IMAGE}` },
    ],
    links: canonicalLinks("/gift"),
  }),
  component: Page,
});
