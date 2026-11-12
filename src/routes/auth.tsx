import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Static parent for every Neon Auth screen under /auth. */
export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: 'ROUT — Account access' }, { name: "description", content: 'Sign in to your ROUT account.' }, { property: "og:title", content: 'ROUT — Account access' }, { property: "og:description", content: 'Sign in to your ROUT account.' }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), 
  component: () => <Outlet />,
});
