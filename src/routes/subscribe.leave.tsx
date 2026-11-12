import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionActionPage } from "@/components/SubscriptionActionPage";

export const Route = createFileRoute("/subscribe/leave")({
  validateSearch: (search: Record<string, unknown>) => ({ t: typeof search["t"] === "string" ? search["t"].slice(0, 100) : "" }),
  head: () => ({
    meta: [
      { title: "Unsubscribe · ROUT" },
      { name: "description", content: "Stop receiving updates from this ROUT profile and remove your address." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { property: "og:title", content: "Unsubscribe · ROUT" },
      { property: "og:description", content: "Stop receiving updates from this ROUT profile and remove your address." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeavePage,
});

function LeavePage() {
  const { t } = Route.useSearch();
  return <SubscriptionActionPage mode="leave" token={t} />;
}
