import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AccountSettings";

export const Route = createFileRoute("/_authenticated/studio_/account")({
  head: () => ({
    meta: [
      { title: "Account & Beveiliging | ROUT" },
      { name: "description", content: "Je globale ROUT-account: e-mail, wachtwoord, passkeys en datacontrole." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Account & Beveiliging | ROUT" },
      { property: "og:description", content: "Je globale ROUT-account: e-mail, wachtwoord, passkeys en datacontrole." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
