import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionActionPage } from "@/components/SubscriptionActionPage";

export const Route = createFileRoute("/subscribe/confirm")({
  validateSearch: (search: Record<string, unknown>) => ({ t: typeof search["t"] === "string" ? search["t"].slice(0, 100) : "" }),
  head: () => ({
    meta: [
      { title: "Confirm your subscription · ROUT" },
      { name: "description", content: "Confirm that you want to receive updates from this ROUT profile." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { property: "og:title", content: "Confirm your subscription · ROUT" },
      { property: "og:description", content: "Confirm that you want to receive updates from this ROUT profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { t } = Route.useSearch();
  return <SubscriptionActionPage mode="confirm" token={t} />;
}
