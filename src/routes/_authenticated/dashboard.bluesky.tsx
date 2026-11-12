import { createFileRoute } from "@tanstack/react-router";
import { SubdomainPanel } from "@/components/dashboard/SubdomainPanel";
import { BlueskyWizard } from "@/components/dashboard/BlueskyWizard";

function BlueskyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bluesky handle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify your rout.be subdomain and use it as your handle on Bluesky.
        </p>
      </header>
      <SubdomainPanel />
      <BlueskyWizard />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/bluesky")({
  head: () => ({
    meta: [
      { title: "Bluesky | ROUT" },
      { name: "description", content: "Beheer je ROUT-account, links en QR-codes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Bluesky | ROUT" },
      { property: "og:description", content: "Beheer je ROUT-account, links en QR-codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlueskyPage,
});
