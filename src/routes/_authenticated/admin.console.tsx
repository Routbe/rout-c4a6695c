import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Admin, { ADMIN_CONSOLE_TABS, type AdminConsoleTab } from "@/components/imported-pages/Admin";

export const Route = createFileRoute("/_authenticated/admin/console")({
  validateSearch: (search: Record<string, unknown>): { tab: AdminConsoleTab } => ({
    tab: (ADMIN_CONSOLE_TABS as readonly string[]).includes(String(search["tab"])) ? (search["tab"] as AdminConsoleTab) : "users",
  }),
  head: () => ({
    meta: [
      { title: "Beheerconsole | ROUT beheer" },
      { name: "description", content: "Gebruikers, betalingen, audit, VIP-handles, promoties, prijzen en levering beheren." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Beheerconsole | ROUT beheer" },
      { property: "og:description", content: "Gebruikers, betalingen, audit, VIP-handles, promoties, prijzen en levering beheren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsolePage,
});

function ConsolePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/console" });
  return <Admin tab={tab} onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })} />;
}
