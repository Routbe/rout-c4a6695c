import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/imported-pages/Dashboard";

const TITLE = "Korte links | ROUT";
const DESC = "Je korte links en hun doelen beheren.";

function LinksPage() {
  return <Dashboard initialTab="links" />;
}

export const Route = createFileRoute("/_authenticated/dashboard/links")({
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
  component: LinksPage,
});
