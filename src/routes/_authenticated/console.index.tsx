import { useI18n } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Blocks, Bot, KeyRound, ReceiptText } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";

const CARDS = [
  { to: "/console/apps", title: "Identity & OAuth", kicker: "Login met ROUT", text: "Beheer OIDC-apps, credentials, redirects, scopes en beveiligingsflows.", icon: Blocks },
  { to: "/console/api", title: "API Keys & Webhooks", kicker: "Directe integraties", text: "Maak beperkte sleutels, bekijk endpoints en bereid webhook-integraties voor.", icon: KeyRound },
  { to: "/console/connectors", title: "AI & MCP Connectors", kicker: "Claude, Cursor & agents", text: "Verbind AI-clients met ROUT-tools via Model Context Protocol.", icon: Bot },
  { to: "/console/billing", title: "Billing & Usage", kicker: "Limieten & facturatie", text: "Een centrale plek voor toekomstig verbruik, limieten en facturen.", icon: ReceiptText },
] as const;

export const Route = createFileRoute("/_authenticated/console/")({
  head: () => ({ meta: [
    { title: "Developer Console | ROUT" },
    { name: "description", content: "Beheer ROUT identity, API-integraties, MCP-connectors en verbruik." },
    { property: "og:title", content: "Developer Console | ROUT" },
    { property: "og:description", content: "De centrale workspace voor ROUT-developers." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: ConsoleHome,
});

function ConsoleHome() {
  const { t } = useI18n();
  return <ConsolePage title="Welcome to ROUT Console" description="Build secure identity and platform integrations from one focused workspace.">
    <div>
      <p className="mb-4 text-xs font-semibold uppercase text-muted-foreground">Quick Access</p>
      <Link to="/developers" data-tour="docs" className="mb-4 inline-flex text-sm text-primary underline underline-offset-4">{t("consoleTour.docs.title")}</Link>
      <div className="grid gap-4 md:grid-cols-2">
        {CARDS.map(({ to, title, kicker, text, icon: Icon }) => <Link key={to} to={to} data-tour={to === "/console/apps" ? "apps" : to === "/console/api" ? "api" : undefined} className="group min-h-52 border border-border bg-card p-6 transition-colors hover:border-foreground/40 hover:bg-muted/30">
          <div className="flex items-start justify-between"><Icon className="h-6 w-6" /><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
          <p className="mt-10 text-xs font-medium uppercase text-muted-foreground">{kicker}</p>
          <h2 className="mt-2 text-xl font-semibold">{title}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{text}</p>
        </Link>)}
      </div>
    </div>
  </ConsolePage>;
}