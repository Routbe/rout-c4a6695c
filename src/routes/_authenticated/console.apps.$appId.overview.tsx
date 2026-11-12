import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { useAppPage } from "@/components/console/useAppPage";
import { getOAuthClientInsights } from "@/lib/oauth/console.functions";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/overview")({
  head: () => ({ meta: [{"title": "Overview \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage overview for your ROUT application."}, {"property": "og:title", "content": "Overview \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage overview for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: OverviewPage,
});

type Check = { ok: boolean | null; title: string; text: string; to: string };

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <CircleDashed className="h-5 w-5 text-muted-foreground" />;
  return ok ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <CircleAlert className="h-5 w-5 text-destructive" />;
}

function OverviewPage() {
  const { appId } = Route.useParams();
  const { app } = useAppPage(appId);
  const insights = useServerFn(getOAuthClientInsights);
  const { data } = useQuery({
    queryKey: ["console", "insights", appId],
    queryFn: () => insights({ data: { id: appId } }),
    retry: false,
  });

  const secureRedirects =
    app.redirectUris.length > 0 && app.redirectUris.every((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u));
  const checks: Check[] = [
    {
      ok: app.redirectUris.length === 0 ? null : secureRedirects,
      title: "Domain verification",
      text: app.redirectUris.length === 0 ? "No redirect URIs yet." : secureRedirects ? "All redirect URIs use HTTPS." : "Some redirect URIs are not secure.",
      to: "/console/apps/$appId/redirects",
    },
    {
      ok: app.requirePkce,
      title: "App security",
      text: app.requirePkce ? "PKCE (S256) is enforced for every flow." : "PKCE is optional (confidential client only).",
      to: "/console/apps/$appId/security",
    },
    {
      ok: app.publishingStatus === "production",
      title: "Publishing status",
      text: app.publishingStatus === "production" ? "In production — open to everyone." : "Testing — only you and test users can sign in.",
      to: "/console/apps/$appId/publishing",
    },
    {
      ok: data ? data.verification.status === "verified" : null,
      title: "ROUT Verified",
      text:
        data?.verification.status === "verified"
          ? "Official ROUT Verified App badge."
          : data?.verification.status === "pending"
            ? "Verification request under review."
            : "Not verified yet.",
      to: "/console/apps/$appId/publishing",
    },
  ];

  const metrics = [
    { label: "Active users", value: data ? data.activeUsers.toLocaleString() : "—", hint: "Accounts that granted consent" },
    { label: "OAuth requests", value: data ? data.requests30d.toLocaleString() : "—", hint: "Last 30 days" },
    { label: "Error rate", value: data ? `${data.errorRate}%` : "—", hint: "Codes never exchanged" },
  ];

  return (
    <ConsolePage title="Dashboard" description={`Project checkup and usage for ${app.name}.`}>
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p className="mt-3 font-display text-3xl tracking-tight">{m.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
          </div>
        ))}
      </div>
      <ConsoleCard title="Project checkup">
        <div className="divide-y divide-border">
          {checks.map((c) => (
            <Link key={c.title} to={c.to} params={{ appId }} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 hover:opacity-80">
              <StatusIcon ok={c.ok} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}
