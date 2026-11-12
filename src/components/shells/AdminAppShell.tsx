import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { PortalContext } from "@/components/layout/PortalContext";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { useRouterState } from "@tanstack/react-router";
import { isAdminPath } from "@/lib/app-mode";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { BrandLoader } from "@/components/BrandLoader";

/**
 * Admin shell (rout.dlp.li): portal context for the sidebar navigation plus a role gate.
 * The gate is UX only — every admin server function re-checks the role.
 * Signed-out visitors fall through to the _authenticated sign-in redirect.
 */
export default function AdminAppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { isAdmin, checking } = useIsAdmin();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const protectedPage = isAdminPath(path);

  if (protectedPage && (loading || (user && checking))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="relative h-24 w-24">
          <BrandLoader label="Beheerrechten controleren…" />
        </div>
      </div>
    );
  }
  if (protectedPage && user && !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" aria-hidden />
        <h1 className="font-display text-2xl text-foreground">Geen toegang</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Dit beheerportaal is alleen voor beheerders.</p>
        <Button variant="outline" onClick={() => void signOut()}>Uitloggen</Button>
        <a href="https://rout.be" className="text-sm text-primary underline-offset-4 hover:underline">Naar de publieke website</a>
      </div>
    );
  }
  return (
    <PortalContext.Provider value={AdminFrame}>
      <div data-shell="admin">{children}</div>
    </PortalContext.Provider>
  );
}
