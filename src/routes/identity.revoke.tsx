import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { confirmIdentityRevoke, describeIdentityRevoke } from "@/lib/identity/links.functions";

export const Route = createFileRoute("/identity/revoke")({
  validateSearch: z.object({ token: z.string().max(200).optional() }),
  head: () => ({
    meta: [
      { title: "Koppeling intrekken — ROUT" },
      { name: "description", content: "Trek een identiteitskoppeling van je ROUT-account in." },
      { property: "og:title", content: "Koppeling intrekken — ROUT" },
      { property: "og:description", content: "Trek een identiteitskoppeling van je ROUT-account in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RevokePage,
});

/** Opening the emailed link only shows the link; revoking happens on an explicit POST. */
function RevokePage() {
  const { token } = Route.useSearch();
  const describe = useServerFn(describeIdentityRevoke);
  const confirm = useServerFn(confirmIdentityRevoke);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done" | "already">("loading");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setState("invalid");
    describe({ data: { token } })
      .then((r) => {
        if (!r) return setState("invalid");
        setLabel(r.label);
        setState(r.status === "revoked" ? "already" : "ready");
      })
      .catch(() => setState("invalid"));
  }, [token, describe]);

  async function revoke() {
    if (!token) return;
    setBusy(true);
    try {
      const r = await confirm({ data: { token } });
      setState(r.ok ? "done" : "already");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">Koppeling intrekken</h1>
        {state === "loading" && <p className="text-sm text-muted-foreground">Even controleren…</p>}
        {state === "invalid" && <p className="text-sm text-muted-foreground">Deze link is ongeldig.</p>}
        {state === "already" && <p className="text-sm text-muted-foreground">Deze koppeling is al ingetrokken.</p>}
        {state === "done" && (
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{label}</strong> is losgekoppeld. Log in en controleer je beveiliging.
          </p>
        )}
        {state === "ready" && (
          <>
            <p className="text-sm text-muted-foreground">
              Wil je <strong className="text-foreground">{label}</strong> loskoppelen van je ROUT-account?
            </p>
            <Button onClick={revoke} disabled={busy} variant="destructive" className="w-full">
              Ja, trek deze koppeling in
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
