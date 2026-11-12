import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Zap } from "lucide-react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { CodeBlock } from "@/components/console/CodeBlock";
import { useAppPage } from "@/components/console/useAppPage";
import { HandleSyncCard } from "@/components/console/HandleSyncCard";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/advanced")({
  head: () => ({ meta: [{"title": "Advanced \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage advanced for your ROUT application."}, {"property": "og:title", "content": "Advanced \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage advanced for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: AdvancedPage,
});

const FLOWS = [
  { id: "seamless", icon: Zap, title: "Seamless", text: "Signed-in members continue with one click." },
  { id: "strict", icon: ShieldCheck, title: "Strict", text: "Always a 6-digit email code before access." },
] as const;

function AdvancedPage() {
  const { appId } = Route.useParams();
  const { app, persist, persistSettings, saving } = useAppPage(appId);
  const origin = typeof window === "undefined" ? "https://rout.be" : window.location.origin;
  const base = `${origin}/oauth/authorize?response_type=code\n  &client_id=${app.clientId}\n  &redirect_uri=${encodeURIComponent(app.redirectUris[0] ?? "https://yourapp.com/callback")}\n  &scope=openid%20profile%20email\n  &code_challenge=<S256_CHALLENGE>&code_challenge_method=S256\n  &state=<STATE>`;

  return (
    <ConsolePage title="Advanced flows" description="ROUT-specific OIDC features, with copy-paste examples.">
      <ConsoleCard title="Flow mode" description="Default strictness for every sign-in to this app.">
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {FLOWS.map(({ id, icon: Icon, title, text }) => {
            const active = app.flowPreference === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => !active && persist({ flowPreference: id })}
                className={`rounded-xl border p-4 text-left transition-colors ${active ? "border-foreground bg-muted" : "border-border hover:border-foreground/40"}`}
              >
                <Icon className="mb-2 h-5 w-5" />
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Force Strict for a single request, even when the app is Seamless (also triggered by <code>prompt=login</code> or <code>max_age</code>). The ID token then carries <code>acr: urn:rout:acr:strict</code>.
        </p>
        <div className="mt-3">
          <CodeBlock label="authorize url — strict" code={`${base}\n  &acr_values=urn:rout:acr:strict`} />
        </div>
      </ConsoleCard>

      <ConsoleCard title="Account Auto-Discovery">
        <div className="flex items-start gap-4">
          <p className="flex-1 text-sm text-muted-foreground">
            Recognize existing ROUT accounts automatically. With <code>prompt=none</code> ROUT never shows a screen: it returns a code when the visitor has an active session and already granted consent, or an OIDC error otherwise.
          </p>
          <Switch aria-label="Account Auto-Discovery" checked={app.accountDiscoveryEnabled} disabled={saving} onCheckedChange={(on) => persistSettings({ accountDiscoveryEnabled: on })} />
        </div>
        <div className="mt-4 space-y-3">
          <CodeBlock label="authorize url — silent" code={`${base}\n  &prompt=none\n  &login_hint=user@example.com   # optional: email or @handle`} />
          <CodeBlock
            label="handle the callback"
            code={`const p = new URL(location.href).searchParams;
if (p.get("code")) {
  // Known ROUT member: exchange the code at the token endpoint.
} else if (["login_required", "consent_required", "interaction_required"].includes(p.get("error"))) {
  // Not recognized silently: show your normal "Login with ROUT" button.
}`}
          />
        </div>
        {!app.accountDiscoveryEnabled && <p className="mt-3 text-xs text-muted-foreground">While off, every <code>prompt=none</code> request returns <code>interaction_required</code>.</p>}
      </ConsoleCard>

      <HandleSyncCard app={app} saving={saving} persist={persist} />

      <ConsoleCard title="Rich Identity">
        <div className="flex items-start gap-4">
          <p className="flex-1 text-sm text-muted-foreground">
            Ask members to share their public activity. They see an extra checkbox that is off by default; data is only shared when they turn it on, as the <code>rout_public_activity</code> claim in the ID token.
          </p>
          <Switch aria-label="Rich Identity" checked={app.richIdentityEnabled} disabled={saving} onCheckedChange={(on) => persist({ richIdentityEnabled: on })} />
        </div>
        <div className="mt-4">
          <CodeBlock
            label="id token claim"
            code={`{
  "sub": "…",
  "rout_public_activity": [
    { "kind": "badge", "title": "Verified creator", "occurred_at": "2026-10-01T12:00:00Z" }
  ]
}`}
          />
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}
