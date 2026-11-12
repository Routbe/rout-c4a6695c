import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, ReceiptText } from "lucide-react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";

export const Route = createFileRoute("/_authenticated/console/billing")({
  head: () => ({ meta: [
    { title: "Billing & Usage | ROUT Console" }, { name: "description", content: "ROUT API-verbruik, limieten en facturatie." },
    { property: "og:title", content: "Billing & Usage | ROUT Console" }, { property: "og:description", content: "ROUT-verbruik en facturatie." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex,nofollow" },
  ]}), component: BillingConsole,
});

function BillingConsole() {
  return <ConsolePage title="Billing & Usage" description="Usage limits and invoices will appear here as the platform expands.">
    <div className="grid gap-4 md:grid-cols-2"><ConsoleCard title="API usage"><div className="flex h-36 items-center justify-center gap-3 text-sm text-muted-foreground"><BarChart3 className="h-5 w-5" />Usage reporting is being prepared.</div></ConsoleCard><ConsoleCard title="Billing"><div className="flex h-36 items-center justify-center gap-3 text-sm text-muted-foreground"><ReceiptText className="h-5 w-5" />No billing account is required yet.</div></ConsoleCard></div>
  </ConsolePage>;
}