import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/imported-pages/Dashboard";

const TITLE = "QR-codes | ROUT";
const DESC = "Je opgeslagen en dynamische QR-codes met scanstatistieken.";

function QrPage() {
  return <Dashboard initialTab="qrs" />;
}

export const Route = createFileRoute("/_authenticated/dashboard/qr")({
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
  component: QrPage,
});
