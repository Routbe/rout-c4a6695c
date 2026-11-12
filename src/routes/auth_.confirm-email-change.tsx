import { createFileRoute } from "@tanstack/react-router";
import { EmailSafetyAction } from "@/components/settings/EmailSafetyAction";
export const Route = createFileRoute("/auth_/confirm-email-change")({
  validateSearch: (search: Record<string, unknown>) => ({ token: typeof search.token === "string" ? search.token : undefined }),
  head: () => ({ meta: [{ title: "E-mailadres bevestigen | ROUT" }, { name: "description", content: "Bevestig je nieuwe ROUT-e-mailadres met een passkey." }, { property: "og:title", content: "E-mailadres bevestigen | ROUT" }, { property: "og:description", content: "Veilige bevestiging van je nieuwe e-mailadres." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  component: () => <EmailSafetyAction freeze={false} />,
});