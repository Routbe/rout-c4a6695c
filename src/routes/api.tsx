import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/api")({
  head: () => ({
    meta: [
      { title: "ROUT API voor developers" },
      {
        name: "description",
        content: "Documentatie, endpoints en API-keys om QR-codes en korte links te automatiseren.",
      },
      { property: "og:title", content: "ROUT API voor developers" },
      {
        property: "og:description",
        content: "Documentatie, endpoints en API-keys om QR-codes en korte links te automatiseren.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/developers", statusCode: 301 });
  },
});
