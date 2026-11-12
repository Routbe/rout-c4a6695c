import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { ExternalLink, Loader2, Mail } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { QrsPanel } from "@/components/dashboard/QrsPanel";
import { EmailForwardingPanel } from "@/components/dashboard/EmailForwardingPanel";
import { SecureShieldWalletCard } from "@/components/dashboard/SecureShieldWalletCard";
import { EmailAliasDomains } from "@/components/dashboard/EmailAliasDomains";
import { useAuth } from "@/hooks/useAuth";
import { getMyHandle } from "@/lib/claim.functions";
import { useUrlStyle } from "@/hooks/useUrlStyle";
import { styledProfileLabel, styledProfilePath } from "@/lib/profile-url";

/**
 * Post-claim management surface: the claimed handle, every active route
 * (static QR + tracked links) and the linked e-mail addresses.
 */
export default function RoutesManager() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [handle, setHandle] = useState<string | null>(null);
  const { style: urlStyle } = useUrlStyle();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav(`/auth?redirect=${encodeURIComponent("/dashboard/routes")}`, { replace: true });
      return;
    }
    let active = true;
    getMyHandle({})
      .then((r) => {
        if (!active) return;
        setHandle(r.handle);
        setResolving(false);
      })
      .catch(() => active && setResolving(false));
    return () => {
      active = false;
    };
  }, [user, loading, nav]);

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="border-b border-border pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Your namespace
          </p>
          <h1 className="mt-2 font-display text-3xl text-foreground">Routes & e-mail</h1>

          {resolving ? (
            <Loader2 className="mt-4 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          ) : handle ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={styledProfilePath(handle, urlStyle)}
                className="inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 font-mono text-sm text-foreground hover:bg-muted"
              >
                {styledProfileLabel(handle, urlStyle)}{" "}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <span className="inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 font-mono text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" aria-hidden /> {handle}@rout.be
              </span>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">You have not claimed a handle yet.</p>
              <Button asChild className="h-10 rounded-lg">
                <Link to="/claim">Claim your handle</Link>
              </Button>
            </div>
          )}
        </header>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Linked e-mail
          </h2>
          <EmailForwardingPanel />
          <div className="mt-4">
            <SecureShieldWalletCard />
          </div>
          <div className="mt-4">
            <EmailAliasDomains />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Active routes
          </h2>
          <QrsPanel />
        </section>
      </main>
    </AppLayout>
  );
}
