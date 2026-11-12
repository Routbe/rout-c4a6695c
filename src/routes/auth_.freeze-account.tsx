import { createFileRoute } from "@tanstack/react-router";
import { EmailSafetyAction } from "@/components/settings/EmailSafetyAction";
export const Route = createFileRoute("/auth_/freeze-account")({
  validateSearch: (search: Record<string, unknown>) => ({ token: typeof search.token === "string" ? search.token : undefined }),
  head: () => ({ meta: [{ title: "Noodbevriezing | ROUT" }, { name: "description", content: "Stop een ongewenste wijziging van je ROUT-e-mailadres." }, { property: "og:title", content: "Noodbevriezing | ROUT" }, { property: "og:description", content: "Veilig herstel van je ROUT-account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  component: () => <EmailSafetyAction freeze />,
});