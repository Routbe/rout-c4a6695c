import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { acceptWorkspaceTransfer, describeWorkspaceTransfer } from "@/lib/workspace-conversion.functions";

export const Route = createFileRoute("/workspace-transfer/$token")({
  head: () => ({
    meta: [
      { title: "Word eigenaar van een Workspace — ROUT" },
      { name: "description", content: "Accepteer het eigenaarschap van een ROUT Workspace met je persoonlijke account." },
      { property: "og:title", content: "Word eigenaar van een Workspace — ROUT" },
      { property: "og:description", content: "Accepteer het eigenaarschap van een ROUT Workspace met je persoonlijke account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptTransfer,
});

const ERRORS: Record<string, string> = {
  invalid: "Deze uitnodiging is verlopen of ingetrokken.",
  same_account: "Je kunt niet zelf eigenaar worden van het account dat wordt omgezet.",
  wrong_account: "Deze uitnodiging is voor een ander account. Log in met het uitgenodigde e-mailadres.",
  email_unverified: "Bevestig eerst je e-mailadres.",
};

function AcceptTransfer() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const describe = useServerFn(describeWorkspaceTransfer);
  const accept = useServerFn(acceptWorkspaceTransfer);
  const { data, isLoading } = useQuery({ queryKey: ["ws-transfer", token], queryFn: () => describe({ data: { token } }) });
  const [msg, setMsg] = useState<string | null>(null);

  async function onAccept() {
    const r = await accept({ data: { token } });
    if (!r.ok) return setMsg(ERRORS[r.reason] ?? "Dat lukte niet.");
    setMsg(r.completed ? "Klaar! Je beheert de Workspace via de workspace-wisselaar." : "Geaccepteerd. De omzetting start zodra het account zelf bevestigt.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        {isLoading || loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : !data || data.expired || data.status === "cancelled" ? (
          <p className="text-sm">{ERRORS["invalid"]}</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Word eigenaar van {data.workspaceName}</h1>
            <p className="text-sm text-muted-foreground">
              Bedrijven loggen niet zelf in. Met je persoonlijke ROUT-account beheer je deze Workspace.
            </p>
            {msg ? (
              <p className="text-sm">{msg}</p>
            ) : user ? (
              <Button onClick={onAccept}>Accepteer eigenaarschap</Button>
            ) : (
              <Button asChild>
                <Link to={"/auth/$authView" as never} params={{ authView: "sign-up" } as never} search={{ redirect: `/workspace-transfer/${token}` } as never}>
                  Maak je persoonlijke account aan
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
