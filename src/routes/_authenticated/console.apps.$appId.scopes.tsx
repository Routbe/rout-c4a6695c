import { createFileRoute } from "@tanstack/react-router";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { useAppPage } from "@/components/console/useAppPage";
import { HandleSyncCard } from "@/components/console/HandleSyncCard";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/scopes")({
  head: () => ({ meta: [{"title": "Scopes \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage scopes for your ROUT application."}, {"property": "og:title", "content": "Scopes \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage scopes for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: ScopesPage,
});

const SCOPES = [
  { id: "openid", label: "openid", text: "Verplicht. Geeft een vaste, anonieme gebruikers-ID (sub).", locked: true },
  { id: "profile", label: "profile", text: "Naam, @handle en profielfoto.", locked: false },
  { id: "email", label: "email", text: "E-mailadres en of het bevestigd is.", locked: false },
  {
    id: "accounts:merge",
    label: "accounts:merge",
    text: "Bestaande accounts herkennen zonder lijst: jij stuurt hashes, de browser van het lid vergelijkt, en alleen het account dat het lid bevestigt komt één keer in de id_token. Zie Schema-templates.",
    locked: false,
  },
  {
    id: "identity:handle_reservation",
    label: "identity:handle_reservation",
    text: "Neem de geverifieerde @handle van het lid over als gebruikersnaam, zonder eigen anti-bot- of anti-squattingcontrole. ROUT controleert of het account actief en bevestigd is en of de naam uniek is.",
    locked: false,
  },
  {
    id: "assets:write",
    label: "assets:write (agent)",
    text: "AI-agent maakt QR-codes en korte links voor het lid, binnen diens abonnement (anders HTTP 402). Token max. 1 uur geldig.",
    locked: false,
  },
  {
    id: "profile:draft",
    label: "profile:draft (agent)",
    text: "AI-agent zet profielontwerpen klaar. Live zetten blijft een menselijke stap (status human_action_required).",
    locked: false,
  },
  {
    id: "identity:read_public",
    label: "identity:read_public (agent)",
    text: "Leest enkel de publieke verificatiestatus (geverifieerde mens ja/nee). Nooit identity relays of wettelijke naam.",
    locked: false,
  },
];

function ScopesPage() {
  const { appId } = Route.useParams();
  const { app, persist, saving } = useAppPage(appId);
  const origin = typeof window === "undefined" ? "https://rout.be" : window.location.origin;
  const snippet = `${origin}/oauth/authorize?response_type=code
  &client_id=${app.clientId}
  &redirect_uri=${encodeURIComponent(app.redirectUris[0] ?? "")}
  &scope=${app.scopes.join("%20")}
  &state=RANDOM&nonce=RANDOM
  &code_challenge=BASE64URL(SHA256(verifier))
  &code_challenge_method=S256`;

  return (
    <ConsolePage title="Scopes" description="Vraag enkel wat je app echt nodig heeft.">
      <ConsoleCard>
        <ul className="divide-y divide-border">
          {SCOPES.map((s) => (
            <li key={s.id} className="flex items-center gap-4 py-3">
              <div className="flex-1">
                <code className="text-sm">{s.label}</code>
                <p className="text-xs text-muted-foreground">{s.text}</p>
              </div>
              <Switch
                checked={app.scopes.includes(s.id)}
                disabled={s.locked || saving}
                onCheckedChange={(on) =>
                  persist({ scopes: on ? [...app.scopes, s.id] : app.scopes.filter((x) => x !== s.id) })
                }
              />
            </li>
          ))}
        </ul>
      </ConsoleCard>
      <HandleSyncCard app={app} saving={saving} persist={persist} />
      <ConsoleCard title="Autorisatie-URL (PKCE)" description="PKCE met S256 is verplicht.">
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{snippet}</pre>
      </ConsoleCard>
    </ConsolePage>
  );
}
