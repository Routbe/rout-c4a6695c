import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy account URLs (/account/settings, /account/security, …) now live on
 * the ROUT settings page.
 */
export const Route = createFileRoute("/account/$accountView")({
  head: () => ({
    meta: [
      { title: "Je account bij ROUT" },
      { name: "description", content: "Beheer je profiel, beveiliging en sessies van je ROUT-account." },
      { property: "og:title", content: "Je account bij ROUT" },
      { property: "og:description", content: "Beheer je profiel, beveiliging en sessies van je ROUT-account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/studio/account", replace: true });
  },
});
