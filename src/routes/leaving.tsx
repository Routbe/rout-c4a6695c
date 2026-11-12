import { createFileRoute } from "@tanstack/react-router";
import { RoutLogo } from "@/components/RoutLogo";
import { Button } from "@/components/ui/button";
import { validatedRedirectTarget } from "@/lib/security/redirect-target";

export const Route = createFileRoute("/leaving")({
  validateSearch: (s: Record<string, unknown>) => ({ target: typeof s.target === "string" ? s.target : "" }),
  head: () => ({ meta: [{ title: "Je verlaat ROUT | Bestemming controleren" }, { name: "description", content: "Controleer de externe bestemming voordat je ROUT verlaat." }, { property: "og:title", content: "Je verlaat ROUT" }, { property: "og:description", content: "Controleer de externe bestemming voordat je verdergaat." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LeavingPage,
});
function LeavingPage() {
  const { target: raw } = Route.useSearch(); const target = validatedRedirectTarget(raw);
  const external = target && !target.startsWith("/") ? target : null;
  return <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 px-6 text-center">
    <RoutLogo size={26} /><h1 className="text-2xl font-display">{external ? "Je verlaat ROUT" : "Bestemming geweigerd"}</h1>
    {external ? <><p className="max-w-sm break-all font-mono text-sm">{new URL(external).hostname}</p><p className="max-w-sm text-sm text-muted-foreground">HTTPS-verbinding. Deze externe website is niet door ROUT geverifieerd.</p><Button asChild><a href={external} rel="noopener noreferrer nofollow">Ga door naar externe site</a></Button></> : <p className="text-sm text-muted-foreground">Deze link bevat geen veilige bestemming.</p>}
  </main>;
}