import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/imported-pages/Dashboard";

const TITLE = "Assets | ROUT";
const DESC = "QR-codes, korte links, bestanden en privacy-first statistieken.";

function AssetsPage() {
  return <Dashboard initialTab="overview" />;
}

export const Route = createFileRoute("/_authenticated/dashboard/assets")({
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
  component: AssetsPage,
});
