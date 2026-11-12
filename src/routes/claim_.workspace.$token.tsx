import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Check, Clock, Loader2, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isClaimToken, claimState } from "@/lib/agent/agent-claims";
import { claimAgentWorkspace, previewAgentWorkspaceClaim } from "@/lib/agent/agent-claims.functions";
import { beginAuthIntent } from "@/lib/tour-draft.functions";

export const Route = createFileRoute("/claim_/workspace/$token")({
  head: () => ({
    meta: [
      { title: "Claim je workspace | ROUT" },
      { name: "description", content: "Een AI-agent heeft een ROUT workspace voor je ingericht. Claim hem om eigenaar te worden." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Claim je workspace | ROUT" },
      { property: "og:description", content: "Een AI-agent heeft een ROUT workspace voor je ingericht. Claim hem om eigenaar te worden." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimWorkspacePage,
});

const MESSAGES: Record<string, string> = {
  claimed: "Deze workspace is al geclaimd.",
  expired: "Deze claim-link is verlopen. Ongeclaimde workspaces worden na 24 uur verwijderd.",
  invalid: "Deze claim-link bestaat niet (meer).",
  error: "Claimen mislukt. Vernieuw de pagina en probeer het opnieuw.",
};

function ClaimWorkspacePage() {
  const { token } = Route.useParams();
  const valid = isClaimToken(token);
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["agent-workspace-claim", token],
    queryFn: () => previewAgentWorkspaceClaim({ data: { token } }),
    enabled: valid && !!user,
    retry: false,
  });
  const claim = useServerFn(claimAgentWorkspace);
  const startLogin = useServerFn(beginAuthIntent);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ slug: string; restored: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = !valid ? "invalid" : done ? "done" : q.data === null ? "invalid" : q.data ? claimState(q.data) : null;

  async function login() {
    setBusy(true);
    try {
      await startLogin({ data: { next: `/claim/workspace/${token}` } });
      await navigate({ to: "/auth/$authView", params: { authView: "sign-in" } });
    } catch {
      setError("error");
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const result = await claim({ data: { token } });
      setDone({ slug: result.slug, restored: result.draftRestored !== false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.includes("claim_used") ? "claimed" : message.includes("claim_expired") ? "expired" : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center gap-5 bg-background px-4 py-16 text-center text-foreground">
        {loading || (user && q.isLoading) ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Laden" />
        ) : done ? (
          <>
            <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-accent/60">
              <Check className="h-10 w-10 text-accent" aria-hidden />
            </div>
            <h1 className="font-display text-3xl">Workspace geclaimd!</h1>
            <p className="text-muted-foreground">
              Je bent nu eigenaar. De AI-agent blijft zichtbaar als Connected App — je kunt zijn toegang altijd intrekken.
            </p>
            {done.restored ? (
              <p className="text-xs text-muted-foreground">Het ontwerp van de agent was versleuteld bewaard en is nu met jouw link geopend.</p>
            ) : (
              <p role="alert" className="text-xs text-destructive">Het ontwerp kon nog niet geopend worden. Open deze link straks opnieuw en klik nogmaals op claimen om het af te ronden.</p>
            )}
            <Button asChild>
              <Link to="/w/$slug" params={{ slug: done.slug }}>Open je workspace</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-primary/60">
              <Bot className="h-10 w-10 text-primary" aria-hidden />
            </div>
            <h1 className="font-display text-3xl">{q.data?.name ?? "Agent workspace"}</h1>
            {q.data && (
              <p className="text-sm text-muted-foreground">
                {q.data.appName ? `De AI-agent ${q.data.appName} heeft` : "Een AI-agent heeft"} deze workspace voor je ingericht.
              </p>
            )}
            {state && state !== "open" ? (
              <p role="status" className="rounded-lg bg-muted px-4 py-2 text-sm">{MESSAGES[state]}</p>
            ) : !user ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Log in of maak een account aan om eigenaar te worden. De agent krijgt nooit je e-mailadres van ROUT.
                </p>
                <Button onClick={() => void login()} disabled={busy}>
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  Inloggen en claimen
                </Button>
              </>
            ) : state === "open" ? (
              <>
                {error && <p role="alert" className="rounded-lg bg-muted px-4 py-2 text-sm">{MESSAGES[error]}</p>}
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Geldig tot {new Date(q.data!.expiresAt).toLocaleString("nl-NL")}
                </p>
                <Button onClick={() => void accept()} disabled={busy}>
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  Word eigenaar van deze workspace
                </Button>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Eenmalige link — na het claimen is hij ongeldig.
                </p>
              </>
            ) : null}
          </>
        )}
      </main>
    </AppLayout>
  );
}
