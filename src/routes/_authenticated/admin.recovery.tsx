import { createFileRoute } from "@tanstack/react-router";
import { AdminRecoveryQueue } from "@/components/admin/AdminRecoveryQueue";

export const Route = createFileRoute("/_authenticated/admin/recovery")({
  head: () => ({
    meta: [
      { title: "Passkey-herstel | ROUT beheer" },
      { name: "description", content: "Herstelaanvragen van accounts zonder passkey, na identiteitscontrole buiten ROUT." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Passkey-herstel | ROUT beheer" },
      { property: "og:description", content: "Herstelaanvragen van accounts zonder passkey, na identiteitscontrole buiten ROUT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRecoveryQueue,
});
