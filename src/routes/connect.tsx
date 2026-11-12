import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { RoutLogo } from "@/components/RoutLogo";
import { getConnectClient } from "@/lib/agent/connect.functions";

/**
 * /connect — Reverse handshake for AI agents. An agent sends its human here
 * with standard OAuth parameters (client_id, redirect_uri, scope, state,
 * PKCE). Signed in → straight to the existing consent screen
 * (/oauth/authorize), which issues a code; the agent swaps it for a
 * short-lived token. Signed out → a short onboarding that returns to the same
 * consent request after sign-up or sign-in.
 */
export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Connect an AI agent" },
      { name: "description", content: "Give an AI assistant limited, revocable access to your ROUT account to create QR codes and links." },
      { property: "og:title", content: "Connect an AI agent to ROUT" },
      { property: "og:description", content: "Give an AI assistant limited, revocable access to your ROUT account to create QR codes and links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const lookup = useServerFn(getConnectClient);
  const [query, setQuery] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [app, setApp] = useState<{ name: string | null; logoUrl: string | null } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("response_type")) params.set("response_type", "code");
    setQuery(params.toString());
    setClientId(params.get("client_id"));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    void lookup({ data: { clientId } }).then(setApp).catch(() => setApp(null));
  }, [clientId, lookup]);

  const authorizeUrl = query ? `/oauth/authorize?${query}` : null;

  // Signed in: the consent screen itself is the decision point.
  useEffect(() => {
    if (!loading && user && clientId && authorizeUrl) window.location.replace(authorizeUrl);
  }, [loading, user, clientId, authorizeUrl]);

  const appName = app?.name ?? t("connect.unknownApp");

  if (loading || query === null || (user && clientId)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-label={t("connect.loading")} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="flex items-center justify-center gap-3">
          {app?.logoUrl ? (
            <img src={app.logoUrl} alt="" className="h-12 w-12 rounded-2xl border border-border object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted">
              <Bot className="h-6 w-6" aria-hidden />
            </span>
          )}
          <span className="text-muted-foreground" aria-hidden>⇄</span>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted">
            <RoutLogo size={24} showWordmark={false} />
          </span>
        </div>

        {clientId ? (
          <>
            <h1 className="mt-6 text-center font-display text-2xl">{app?.name ? t("connect.title", { app: app.name }) : t("connect.titleUnknown")}</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">{t("connect.intro", { app: appName })}</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3"><QrCode className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("connect.point.assets")}</li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("connect.point.control")}</li>
              <li className="flex gap-3"><Bot className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("connect.point.ephemeral")}</li>
            </ul>
            <div className="mt-8 grid gap-3">
              <Button asChild size="lg">
                <a href={`/auth/sign-up?next=${encodeURIComponent(authorizeUrl ?? "/")}`}>{t("connect.signUp")}</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={`/auth/sign-in?next=${encodeURIComponent(authorizeUrl ?? "/")}`}>{t("connect.signIn")}</a>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center font-display text-2xl">{t("connect.devTitle")}</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">{t("connect.devIntro")}</p>
            <pre className="mt-6 overflow-x-auto rounded-xl bg-muted p-4 text-xs">{`/connect?client_id=…&redirect_uri=…
  &scope=openid assets:write profile:draft
  &state=…&code_challenge=…&code_challenge_method=S256`}</pre>
            <div className="mt-6 flex justify-center gap-4 text-sm">
              <a className="underline" href="/llms.txt">llms.txt</a>
              <a className="underline" href="/.well-known/openapi.json">openapi.json</a>
              <Link className="underline" to="/developers">{t("connect.devDocs")}</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
