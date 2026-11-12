import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminAccessPanel } from "@/components/admin/AdminAccessPanel";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: () => ({
    meta: [
      { title: "Mede-admins & rechten | ROUT beheer" },
      { name: "description", content: "Stel mede-admins in en bepaal per persoon welke rechten ze krijgen." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Mede-admins & rechten | ROUT beheer" },
      { property: "og:description", content: "Stel mede-admins in en bepaal per persoon welke rechten ze krijgen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppLayout title="Mede-admins & rechten" crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Team" }]} width="wide">
      <AdminAccessPanel />
    </AppLayout>
  ),
});
