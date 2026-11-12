import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { CodeBlock } from "@/components/console/CodeBlock";
import { useAppPage } from "@/components/console/useAppPage";
import { buildPrismaSchema, buildSqlSchema } from "@/lib/oauth/integration-templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/schema")({
  head: () => ({ meta: [{ title: "Schema-templates — ROUT Developer Console" }, { name: "description", content: "SQL- en Prisma-schema’s voor veilige ROUT-identiteitskoppelingen." }, { property: "og:title", content: "Schema-templates — ROUT Developer Console" }, { property: "og:description", content: "SQL- en Prisma-schema’s voor veilige ROUT-identiteitskoppelingen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SchemaPage,
});

function SchemaPage() {
  const { appId } = Route.useParams();
  const { app } = useAppPage(appId);
  const [kind, setKind] = useState<"sql" | "prisma">("sql");
  const diagram = app.accountDiscoveryEnabled
    ? "ROUT id_token ──► sub ──► user_identities(provider='rout') ──► users\n                   └─ email_verified + email match ─► link bestaande user"
    : "ROUT id_token ──► sub ──► users.rout_id (uniek)";
  return (
    <ConsolePage title="Schema-templates" description="Kopieer hoe je tabellen eruitzien om ROUT-logins, Auto-Discovery en Rich Identity correct op te slaan.">
      <ConsoleCard title="Zo stroomt de data">
        <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">{diagram}</pre>
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          <li><b className="text-foreground">rout_id</b> — de stabiele ROUT-ID (sub). Zoek gebruikers hierop, niet op e-mail.</li>
          {app.richIdentityEnabled && <li><b className="text-foreground">Badges</b> — overschrijf ze bij elke login vanuit de claims; nooit vanuit formulieren.</li>}
          {app.scopes.includes("linked_accounts") && <li><b className="text-foreground">linked_accounts</b> — uitgeschakeld: ROUT deelt geen lijst met gekoppelde accounts meer. Gebruik Blind Hash Matching hieronder.</li>}
          {app.accountDiscoveryEnabled && <li><b className="text-foreground">Samenvoegen</b> — koppel enkel als email_verified waar is. Unieke sleutels verhinderen dubbele koppelingen.</li>}
        </ul>
      </ConsoleCard>
      <ConsoleCard title="Bestaande accounts herkennen (Blind Hash Matching)">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Zet de scope <b className="text-foreground">accounts:merge</b> aan. Stuur bij het inloggen tot 20 SHA-256-hashes mee van gegevens die jij al hebt (e-mailadres, Google-ID, GitHub-ID…). De browser van het lid vergelijkt ze zelf; ROUT bewaart of logt ze nooit.</p>
          <p>Bevestigt het lid een match, dan staat precies dat ene account in de id_token als <code className="font-mono text-foreground">rout_matched_account</code> {"{ kind, value }"}. Niet in userinfo, niet bij een refresh. Je ziet nooit welke andere accounts het lid heeft.</p>
          <p>Zet de hashes in het <b className="text-foreground">#fragment</b> van de autorisatie-URL, zodat ze geen enkele server bereiken.</p>
        </div>
        <CodeBlock label="blind-hashes.js" code={`import { createHash } from "node:crypto";

// kind: "email" | "google" | "github" | "gitlab" | "apple" | "microsoft" | "discord"
// email: trim + lowercase. Provider-ID's: enkel trim.
const blind = (kind, value) => createHash("sha256")
  .update(\`rout-bhm-v1|${app.clientId}|\${kind}:\${kind === "email" ? value.trim().toLowerCase() : value.trim()}\`)
  .digest("hex");

const hashes = [blind("email", "oud@voorbeeld.be"), blind("google", "1098765432101234")];
const url = authorizeUrl + "#rout_blind_hashes=" + hashes.slice(0, 20).join(",");
// Na de login: idToken.rout_matched_account → { kind: "email", value: "oud@voorbeeld.be" }`} />
      </ConsoleCard>
      <div className="flex gap-2">
        {(["sql", "prisma"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cn("rounded-full border px-3 py-1 text-sm", kind === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
            {k === "sql" ? "SQL (Postgres)" : "Prisma"}
          </button>
        ))}
      </div>
      <CodeBlock label={kind === "sql" ? "schema.sql" : "schema.prisma"} code={kind === "sql" ? buildSqlSchema(app) : buildPrismaSchema(app)} />
    </ConsolePage>
  );
}
