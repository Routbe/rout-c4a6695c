import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminCommandCenter";
import { commandQuery } from "@/lib/admin-control.queries";
import { controlAccess } from "@/lib/admin-control-access";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: controlAccess,
  loader: ({ context }) => context.queryClient.ensureQueryData(commandQuery),
  head: () => ({
    meta: [
      { title: "Mission Control | ROUT beheer" },
      { name: "description", content: "Actieve leden, uitgedeelde badges en openstaande beheeracties op ROUT." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Mission Control | ROUT beheer" },
      { property: "og:description", content: "Leden, badges, verificaties en operationele aandachtspunten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
