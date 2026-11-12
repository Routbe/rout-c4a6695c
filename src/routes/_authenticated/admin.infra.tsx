import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminInfrastructure";
import { infraQuery } from "@/lib/admin-control.queries";
import { controlAccess } from "@/lib/admin-control-access";

export const Route = createFileRoute("/_authenticated/admin/infra")({
  beforeLoad: controlAccess,
  loader: ({ context }) => context.queryClient.ensureQueryData(infraQuery()),
  head: () => ({ meta: [{ title: "Infrastructuur & Logs | ROUT beheer" }, { name: "description", content: "Webhooklogboek, subdomeinen en e-mailaliassen van ROUT." }, { name: "robots", content: "noindex, nofollow" }, { property: "og:title", content: "Infrastructuur & Logs | ROUT beheer" }, { property: "og:description", content: "Operationele systeemevents en netwerkregistraties controleren." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});