import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/AdminFinance";
import { financeQuery } from "@/lib/admin-control.queries";
import { controlAccess } from "@/lib/admin-control-access";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  beforeLoad: controlAccess,
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery()),
  head: () => ({ meta: [{ title: "Financieel & SEPA | ROUT beheer" }, { name: "description", content: "IBAN-register en SEPA reviews voor ROUT-beheerders." }, { name: "robots", content: "noindex, nofollow" }, { property: "og:title", content: "Financieel & SEPA | ROUT beheer" }, { property: "og:description", content: "Rekeninghouders en geverifieerde identiteiten controleren." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});