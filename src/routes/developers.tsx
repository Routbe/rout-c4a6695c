import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { CodeBlock } from "@/components/CodeBlock";
import { RoutButtonKit } from "@/components/dev/RoutButtonKit";
import { DISCOVERY_URL, emailUpdatedSample, WEBHOOK_VERIFY_SNIPPET } from "@/lib/oauth/integration-templates";

const EMAIL_SAMPLE = emailUpdatedSample();
import { RATE_RULES } from "@/lib/rate-limit-rules";
import { Trans } from "react-i18next";
import { useI18n } from "@/lib/i18n";

const TITLE = "Developers — Login met ROUT, verificaties en API";
const DESC = "Integreer Login met ROUT (OIDC + PKCE), begrijp hoe verificaties werken en bekijk alle endpoints, foutcodes en limieten.";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [...pathCardMeta("/developers", "nl"), 
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DevelopersPage,
});

const NAV = ["mcp", "start", "pkce", "claims", "client", "handle-sync", "verifications", "api", "errors"] as const;
const NAV_KEY: Record<(typeof NAV)[number], string> = { mcp: "mcp", start: "start", pkce: "pkce", claims: "claims", client: "client", "handle-sync": "handleSync", verifications: "verifications", api: "api", errors: "errors" };


const PKCE_JS = `// Server-side start handler: only run after the form's explicit POST.
// Pseudocode: use your OIDC library + framework cookie/CSRF helpers.
const clientId = process.env.ROUT_CLIENT_ID;
const redirectUri = process.env.ROUT_REDIRECT_URI; // exact registered URL in YOUR app
if (!clientId || !redirectUri) throw new Error("ROUT is not configured");
// 1. Fetch discovery (never hardcode endpoints)
const oidc = await fetch("${DISCOVERY_URL}").then((r) => r.json());

// 2. Per attempt: verifier, state and nonce — keep them in an HttpOnly cookie
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)))
  .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
const challenge = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
const state = crypto.randomUUID();
const nonce = crypto.randomUUID();

// 3. Redirect
const url = new URL(oidc.authorization_endpoint);
url.search = new URLSearchParams({
  response_type: "code",
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: "openid profile email",
  code_challenge: challenge,
  code_challenge_method: "S256",
  state, nonce,
}).toString();
// Persist verifier/state/nonce in a short-lived HttpOnly Secure SameSite=Lax cookie,
// then return a redirect to url. Never run this when the page merely loads.`;

const TOKEN_JS = `// On your server, in /auth/callback/rout — after checking state
const res = await fetch(oidc.token_endpoint, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code, redirect_uri, code_verifier: verifier,
    client_id: process.env.ROUT_CLIENT_ID,
    client_secret: process.env.ROUT_CLIENT_SECRET, // never in the browser
  }),
});
const { id_token, access_token } = await res.json();
// Verify id_token via jwks_uri (ES256): iss, aud === client_id, exp and nonce.`;

const SCHEMA_SQL = `alter table users add column if not exists rout_id text unique;
alter table users add column if not exists email_verified boolean not null default false;
alter table users add column if not exists is_verified_person boolean not null default false;
alter table users add column if not exists is_verified_business boolean not null default false;
alter table users add column if not exists is_influencer boolean not null default false;

create table if not exists user_identities (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,          -- 'rout'
  subject text not null,           -- sub-claim
  primary key (provider, subject)
);`;

const ENDPOINTS = [
  ["GET", "/.well-known/openid-configuration", "discovery"],
  ["GET", "/.well-known/jwks.json", "jwks"],
  ["GET", "/oauth/authorize", "authorize"],
  ["POST", "/api/public/oauth/token", "token"],
  ["GET", "/api/public/oauth/userinfo", "userinfo"],
] as const;

const ERRORS = [
  ["invalid_request", "400"], ["invalid_client", "401"], ["invalid_grant", "400"],
  ["unsupported_grant_type", "400"], ["access_denied", "—"], ["rate_limited", "429"],
] as const;

const VERIFICATIONS = [
  ["Google / YouTube", "google"], ["GitHub", "github"], ["GitLab", "gitlab"],
  ["Bluesky / AT Protocol", "bluesky"], ["Mastodon / fediverse", "mastodon"], [null, "manual"],
] as const;

const K = "pages.developers.";
const TAGS = { c: <code />, b: <b className="text-foreground" />, i: <i />, a: <a href="#errors" className="underline" /> };
function Rich({ k }: { k: string }) {
  return <Trans i18nKey={K + k} components={TAGS} />;
}
function RichLink({ k, to }: { k: string; to: "/console/apps/new" | "/console/api" }) {
  return <Trans i18nKey={K + k} components={{ ...TAGS, l: <Link to={to} className="text-foreground underline" /> }} />;
}


function DevelopersPage() {
  const { t: tr } = useI18n();
  const t = (k: string, v?: Record<string, unknown>) => tr(K + k, v as never);
  return (
    <AppLayout crumbs={[{ label: "Developers" }]}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[13rem_1fr]">
        <nav aria-label={t("navLabel")} className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {NAV.map((id) => (
              <li key={id}><a href={`#${id}`} className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">{t(`nav.${NAV_KEY[id]}`)}</a></li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0 space-y-14 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:font-medium [&_p]:leading-relaxed [&_p]:text-muted-foreground">
          <header className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">ROUT Developers</p>
            <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="max-w-2xl text-muted-foreground">{t("lead")}</p>
            <ul className="flex flex-wrap gap-2 pt-1" aria-label={t("resources")}>
              {[
                { label: "llms.txt", state: "Live", href: "/llms.txt", ready: true },
                { label: t("openapi"), state: "Live", href: "/.well-known/openapi.json", ready: true },
                { label: t("nav.mcp"), state: "Live · Operational", href: "#mcp", ready: true },
              ].map((b) => (
                <li key={b.label}>
                  <a href={b.href} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-foreground hover:border-ring">
                    <span className={b.ready ? "h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" : "h-1.5 w-1.5 rounded-full bg-muted-foreground"} aria-hidden />
                    {b.label} <span className="text-muted-foreground">· {b.state}</span>
                  </a>
                </li>
              ))}
            </ul>
          </header>

          <section id="mcp" className="scroll-mt-24 space-y-4">
            <h2>{t("nav.mcp")}</h2>
            <p>{t("mcp.body")}</p>
            <CodeBlock code={`https://rout.be/api/mcp`} language="text" />
            <CodeBlock language="json" code={`{
  "mcpServers": {
    "rout": {
      "url": "https://rout.be/api/mcp",
      "headers": { "Authorization": "Bearer <ROUT OAuth access token>" }
    }
  }
}`} />
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li><code>rout_read_profile</code> — {t("mcp.read")}</li>
              <li><code>rout_generate_qr</code> — <Rich k="mcp.qr" /></li>
              <li><code>rout_create_draft</code> — <Rich k="mcp.draft" /></li>
              <li><code>rout_provision_workspace</code> — <Rich k="mcp.ws" /></li>
            </ul>
          </section>

          <section id="start" className="scroll-mt-24 space-y-4">
            <h2>{t("nav.start")}</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li><RichLink k="start.1" to="/console/apps/new" /></li>
              <li><Rich k="start.2" /></li>
              <li>{t("start.3")}</li>
            </ol>
            <CodeBlock code={DISCOVERY_URL} language="text" />
            <p>{t("start.note")}</p>
          </section>

          <RoutButtonKit />

          <section id="pkce" className="scroll-mt-24 space-y-4">
            <h2>{t("pkce.title")}</h2>
            <p>{t("pkce.body")}</p>
            <CodeBlock code={PKCE_JS} language="javascript" />
            <CodeBlock code={TOKEN_JS} language="javascript" />
            <p><Rich k="pkce.note" /></p>
          </section>

          <section id="claims" className="scroll-mt-24 space-y-4">
            <h2>{t("claims.title")}</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left"><tr><th className="p-3">Scope</th><th className="p-3">Claims</th></tr></thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="p-3 font-mono">openid</td><td className="p-3 text-muted-foreground"><Rich k="claims.openid" /></td></tr>
                  <tr><td className="p-3 font-mono">profile</td><td className="p-3 text-muted-foreground"><Rich k="claims.profile" /></td></tr>
                  <tr><td className="p-3 font-mono">email</td><td className="p-3 text-muted-foreground"><code>email</code>, <code>email_verified</code></td></tr>
                                    <tr><td className="p-3 font-mono">Rich Identity</td><td className="p-3 text-muted-foreground"><Rich k="claims.rich" /></td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="client" className="scroll-mt-24 space-y-4">
            <h2>{t("client.title")}</h2>
            <p>{t("client.intro")}</p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li><Rich k="client.button" /></li>
              <li><Rich k="client.popup" /></li>
              <li><Rich k="client.callback" /></li>
              <li><Rich k="client.session" /></li>
              <li><Rich k="client.link" /></li>
              <li><Rich k="client.rich" /></li>
              <li><Rich k="client.errors" /></li>
            </ul>
            <CodeBlock code={SCHEMA_SQL} language="sql" />
          </section>

          <section id="handle-sync" className="scroll-mt-24 space-y-4">
            <h2>{t("sync.title")}</h2>
            <p><Rich k="sync.p1" /></p>
            <p><Rich k="sync.p2" /></p>
            <CodeBlock code={EMAIL_SAMPLE} language="json" />
            <CodeBlock code={WEBHOOK_VERIFY_SNIPPET} language="javascript" />
          </section>

          <section id="verifications" className="scroll-mt-24 space-y-4">
            <h2>{t("ver.title")}</h2>
            <p>{t("ver.lead")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {VERIFICATIONS.map(([name, k]) => (
                <div key={k} className="rounded-xl border border-border p-4">
                  <p className="font-medium">{name ?? t("ver.manualTitle")}</p>
                  <p className="mt-1 text-sm">{t(`ver.${k}`)}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="api" className="scroll-mt-24 space-y-4">
            <h2>{t("api.title")}</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {ENDPOINTS.map(([m, p, k]) => (
                    <tr key={p}><td className="p-3 font-mono text-xs">{m}</td><td className="p-3 font-mono text-xs">{p}</td><td className="p-3 text-muted-foreground">{t(`ep.${k}`)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p><RichLink k="api.keys" to="/console/api" /></p>
          </section>

          <section id="errors" className="scroll-mt-24 space-y-4">
            <h2>{t("err.title")}</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {ERRORS.map(([c, s]) => (
                    <tr key={c}><td className="p-3 font-mono text-xs">{c}</td><td className="p-3 font-mono text-xs">{s}</td><td className="p-3 text-muted-foreground">{t(`err.${c}`)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("limit.token", { n: RATE_RULES.oauthToken.limit })}</li>
              <li>{t("limit.auth", { n: RATE_RULES.authAttempt.limit })}</li>
              <li>{t("limit.app", { n: RATE_RULES.appCreate.limit })}</li>
              <li>{t("limit.sms", { user: RATE_RULES.smsSendUser.limit, phone: RATE_RULES.smsSendPhone.limit })}</li>
            </ul>
          </section>
        </article>
      </div>
    </AppLayout>
  );
}
