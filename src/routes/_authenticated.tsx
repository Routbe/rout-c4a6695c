import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BrandLoader } from "@/components/BrandLoader";
import { SunsetOverlay } from "@/components/SunsetOverlay";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({ meta: [{ title: 'ROUT — Member area' }, { name: "description", content: 'Your ROUT account and workspace.' }, { property: "og:title", content: 'ROUT — Member area' }, { property: "og:description", content: 'Your ROUT account and workspace.' }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), 
  component: AuthenticatedLayout,
});

/**
 * Session gate for every signed-in surface. The session cookie is httpOnly, so
 * the check runs through the shared auth context (one server lookup per mount);
 * the blocked URL is kept so the member lands back where they intended.
 */
function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    if (location.pathname.startsWith("/auth")) return;
    const redirect = `${location.pathname}${location.searchStr ?? ""}`;
    navigate({ to: "/auth/$authView", params: { authView: "sign-in" }, search: { redirect }, replace: true } as never);
  }, [loading, user, navigate, location.pathname, location.searchStr]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="relative h-24 w-24">
          <BrandLoader label="Beveiligde sessie controleren…" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <Outlet />
      <SunsetOverlay />
    </>
  );
}
