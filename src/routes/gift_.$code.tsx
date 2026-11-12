import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/GiftCardView";
import { OG_IMAGE, canonicalLinks } from "@/lib/social-meta";

const TITLE = "Je ROUT-cadeaubon";
const DESCRIPTION =
  "Bekijk je ROUT-cadeaubon in 3D, met de code die je bij het afrekenen kunt invullen.";

export const Route = createFileRoute("/gift_/$code")({
  head: ({ params }) => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `https://rout.be/gift/${params.code}` },
      { property: "og:image", content: `https://rout.be${OG_IMAGE}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `https://rout.be${OG_IMAGE}` },
      { name: "robots", content: "noindex" },
    ],
    links: canonicalLinks(`/gift/${params.code}`),
  }),
  component: Page,
});
