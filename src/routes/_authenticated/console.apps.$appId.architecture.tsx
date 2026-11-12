import { createFileRoute } from "@tanstack/react-router";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { useAppPage } from "@/components/console/useAppPage";
import { DISCOVERY_URL, SCOPE_CLAIMS, claimsForScopes } from "@/lib/oauth/integration-templates";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/architecture")({
  head: () => ({
    meta: [
      { title: "Architectuur — ROUT Developer Console" },
      { name: "description", content: "Hoe Login met ROUT werkt: stappen, endpoints en claims per scope." },
      { property: "og:title", content: "Architectuur — ROUT Developer Console" },
      { property: "og:description", content: "Stappen, endpoints en claims per scope voor je ROUT-app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchitecturePage,
});

const FLOW = `Jouw app (server)            Browser                     rout.be
  │ 1. state+nonce+PKCE ──────► redirect ───────────────► /authorize
  │                                                     2. login + toestemming
  │ ◄──────────── 3. ?code&state ◄─── redirect ◄──────────┘
  │ 4. POST /token (code + code_verifier + secret) ─────► rout.be
  │ ◄──────────── 5. id_token + access_token
  │ 6. id_token checken via JWKS (iss, aud, exp, nonce)
  │ 7. GET /userinfo (Bearer) ─────────────────────────► rout.be
  └ 8. gebruiker koppelen op sub → eigen sessie`;

function ArchitecturePage() {
  const { appId } = Route.useParams();
  const { app } = useAppPage(appId);
  const granted = claimsForScopes(app.scopes);
  return (
    <ConsolePage title="Architectuur" description="Hoe een login met ROUT stap voor stap verloopt, en welke gegevens je app krijgt.">
      <ConsoleCard title="De stroom">
        <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">{FLOW}</pre>
        <p className="mt-3 text-sm text-muted-foreground">
          Endpoints haal je op via <code className="font-mono text-xs">{DISCOVERY_URL}</code>. Tokens blijven op je server.
        </p>
      </ConsoleCard>
      <ConsoleCard title="Claims per scope">
        <div className="space-y-2">
          {Object.entries(SCOPE_CLAIMS).map(([scope, claims]) => {
            const on = scope === "openid" || app.scopes.includes(scope);
            return (
              <div key={scope} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className={on ? "font-medium text-foreground" : "text-muted-foreground line-through"}>{scope}</span>
                <span className="font-mono text-xs text-muted-foreground">{claims.join(", ")}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Je app ontvangt nu: {granted.join(", ")}</p>
      </ConsoleCard>
      <ConsoleCard title="Instellingen die meespelen">
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>PKCE: {app.requirePkce ? "verplicht" : "aanbevolen"}</li>
          <li>Rich Identity: {app.richIdentityEnabled ? "aan" : "uit"}</li>
          <li>Account Auto-Discovery: {app.accountDiscoveryEnabled ? "aan (koppelen op bevestigd e-mailadres)" : "uit"}</li>
          <li>Terugkeeradressen: {app.redirectUris.length || "geen ingesteld"}</li>
        </ul>
      </ConsoleCard>
    </ConsolePage>
  );
}
