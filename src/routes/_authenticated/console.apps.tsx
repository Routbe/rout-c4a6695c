import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/console/apps")({
  head: () => ({
    meta: [
      { title: "Developer Console — Login met ROUT" },
      { name: "description", content: "Beheer je apps voor Login met ROUT: sleutels, branding, redirects, scopes en beveiliging." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Developer Console — Login met ROUT" },
      { property: "og:description", content: "Beheer je apps voor Login met ROUT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsoleLayout,
});

function ConsoleLayout() {
  return <Outlet />;
}
