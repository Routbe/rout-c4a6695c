import { createFileRoute } from "@tanstack/react-router";
import { IdentityHub } from "@/components/dashboard/IdentityHub";

const TITLE = "Identity & Connected Apps | ROUT";
const DESC = "Beheer apps die met “Login met ROUT” zijn gekoppeld en push je e-mailwijziging via het ROUT Push Protocol.";

export const Route = createFileRoute("/_authenticated/dashboard/identity")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IdentityHub,
});
