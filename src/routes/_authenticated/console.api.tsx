import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, ShieldCheck, Webhook } from "lucide-react";
import { ApiKeys } from "@/components/imported-pages/DeveloperHub";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/console/CodeBlock";
import { useTranslation } from "react-i18next";
import { emailUpdatedSample, WEBHOOK_VERIFY_SNIPPET } from "@/lib/oauth/integration-templates";
import { ApiActivity } from "@/components/console/ApiActivity";
import { DocHelpLink } from "@/components/seo/DocHelpLink";

export const Route = createFileRoute("/_authenticated/console/api")({
  head: () => ({ meta: [
    { title: "API Keys & Webhooks | ROUT Console" }, { name: "description", content: "Beheer ROUT API-sleutels en webhook-integraties." },
    { property: "og:title", content: "API Keys & Webhooks | ROUT Console" }, { property: "og:description", content: "Veilige ROUT API-integraties." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex,nofollow" },
  ]}), component: ApiConsole,
});

function ApiConsole() {
  return <ConsolePage title="API Keys & Webhooks" description="Credentials and endpoints for direct server-side integrations.">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <ApiKeys />
        <ApiActivity />
      </div>
      <div className="space-y-4">
        <ConsoleCard title="OpenAPI 3.1" description="Machine-readable reference for ROUT endpoints.">
          <Button asChild variant="outline"><a href="/api/public/openapi.json" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open specification</a></Button>
        </ConsoleCard>
        <EmailWebhookPreview />
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Secret keys belong on your server only.</div>
        <DocHelpLink to="/support/workspace/developer-console">Lees hoe je veilig API-sleutels rouleert</DocHelpLink>
      </div>
    </div>
  </ConsolePage>;
}
function EmailWebhookPreview() {
  const { t } = useTranslation();
  return (
    <ConsoleCard title={t("console.webhooks.title")} description={t("console.webhooks.desc")}>
      <div className="space-y-3">
        <div className="flex items-start gap-3 text-sm text-muted-foreground"><Webhook className="mt-0.5 h-4 w-4 shrink-0" /><p>{t("console.webhooks.body")}</p></div>
        <CodeBlock label="POST · x-rout-event: user.email_updated · x-rout-signature: t=…,v1=…" code={emailUpdatedSample()} />
        <p className="text-xs text-muted-foreground">{t("console.webhooks.verify")}</p>
        <CodeBlock label="verify-signature.ts" code={WEBHOOK_VERIFY_SNIPPET} />
      </div>
    </ConsoleCard>
  );
}
