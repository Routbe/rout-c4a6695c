import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Stamp } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { BadgeEmblem } from "@/components/profile/BadgeEmblem";
import { useAuth } from "@/hooks/useAuth";
import { getStampClaim, redeemStampClaim } from "@/lib/badge-claims.functions";

import { beginAuthIntent } from "@/lib/tour-draft.functions";

export const Route = createFileRoute("/claim_/$token")({
  head: () => ({
    meta: [
      { title: "Claim je stempel | ROUT" },
      { name: "description", content: "Voeg deze stempel toe aan je digitale paspoort op ROUT." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Claim je stempel | ROUT" },
      { property: "og:description", content: "Voeg deze stempel toe aan je digitale paspoort op ROUT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimStampPage,
});

const MESSAGES: Record<string, string> = {
  claimed: "Stamp toegevoegd!",
  already: "Deze stempel heb je al.",
  invalid: "Deze claim-link bestaat niet (meer).",
  expired: "Deze claim-link is verlopen.",
  exhausted: "Alle stempels van deze link zijn al geclaimd.",
};

function ClaimStampPage() {
  const { token } = Route.useParams();
  const valid = /^stamp_[a-z0-9]{8,32}$/.test(token);
  const { user, loading } = useAuth();
  const redeem = useServerFn(redeemStampClaim);
  const q = useQuery({ queryKey: ["stamp-claim", token], queryFn: () => getStampClaim({ data: { token } }), enabled: valid, retry: false });
  const [result, setResult] = useState<string | null>(null);
  const tried = useRef<string | null>(null);
  const startLogin = useServerFn(beginAuthIntent);
  const navigate = useNavigate();
  const [loginBusy, setLoginBusy] = useState(false);

  // Signed-in visitors get the stamp automatically.
  useEffect(() => {
    if (!user || tried.current === `${token}:${user.id}` || !q.data) return;
    tried.current = `${token}:${user.id}`;
    setResult(null);
    redeem({ data: { token } })
      .then((r) => setResult(r.result))
      .catch(() => setResult("error"));
  }, [user, q.data, redeem, token]);

  const state = q.isError ? "error" : !valid || q.data === null ? "invalid" : (result ?? (q.data && q.data.state !== "open" ? q.data.state : null));
  async function login() {
    setLoginBusy(true);
    try {
      await startLogin({ data: { next: `/claim/${token}` } });
      await navigate({ to: "/auth/$authView", params: { authView: "sign-in" } });
    } catch {
      setResult("error");
      setLoginBusy(false);
    }
  }

  return (
    <AppLayout>
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center gap-5 bg-background px-4 py-16 text-center text-foreground">
        {q.isLoading || loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Laden" />
        ) : (
          <>
            {q.data?.badge ? (
              <div key={result} className={`${result === "claimed" ? "motion-safe:animate-in motion-safe:zoom-in-50 duration-500" : ""} grid h-40 w-40 rotate-[-6deg] place-items-center rounded-full border-4 border-dashed border-primary/60`} style={{ borderColor: q.data.badge.accentColor ?? undefined }}>
                <BadgeEmblem badge={q.data.badge} size={96} />
              </div>
            ) : (
              <Stamp className="h-12 w-12 text-muted-foreground" aria-hidden />
            )}
            <h1 className="font-display text-3xl">{q.data?.badge.name ?? "Stempel"}</h1>
            {q.data?.badge.description && <p className="text-muted-foreground">{q.data.badge.description}</p>}
            {state ? (
              <p role="status" className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm">{state === "claimed" && <Check className="h-4 w-4 text-accent" aria-hidden />}{MESSAGES[state] ?? "Claimen mislukt. Vernieuw om te controleren of je stempel is opgeslagen."}</p>
            ) : !user ? (
              <>
                <p className="text-sm text-muted-foreground">Log in om deze stempel aan je paspoort toe te voegen.</p>
                <Button onClick={() => void login()} disabled={loginBusy}>
                  {loginBusy && <Loader2 className="animate-spin" aria-hidden />}
                  Inloggen en claimen
                </Button>
              </>
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Stempel toevoegen" />
            )}
            {(state === "claimed" || state === "already") && (
              <Button asChild variant="outline">
                <Link to="/dashboard/profile">Bekijk mijn profiel</Link>
              </Button>
            )}
          </>
        )}
      </main>
    </AppLayout>
  );
}
