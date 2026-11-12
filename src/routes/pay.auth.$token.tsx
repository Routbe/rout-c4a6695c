import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { getParentView, startParentPayment } from "@/lib/parent.functions";

export const Route = createFileRoute("/pay/auth/$token")({
  loader: ({ params }) => getParentView({ data: { token: params.token } }).catch(() => ({ view: null })),
  head: () => ({
    meta: [
      { title: "Betaling goedkeuren" },
      { name: "description", content: "Bekijk en betaal een aankoop die je kind op ROUT aanvroeg." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Betaling goedkeuren — ROUT" },
      { property: "og:description", content: "Ouderlijke goedkeuring voor een betaling op ROUT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayAuth,
});

function PayAuth() {
  const { token } = Route.useParams();
  const { view } = Route.useLoaderData();
  const start = useServerFn(startParentPayment);
  const [busy, setBusy] = useState(false);
  const ok = view && view.action === "payment";

  const pay = async () => {
    setBusy(true);
    try {
      const r = await start({ data: { token, origin: window.location.origin } });
      if (r.ok) window.location.href = r.url;
      else toast.error(r.reason === "approved" ? "Deze betaling is al gestart." : "Deze link is verlopen of niet beschikbaar.");
    } finally { setBusy(false); }
  };

  return (
    <AppLayout>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">Betaling goedkeuren</h1>
        {!ok ? (
          <p className="text-sm text-muted-foreground">Deze link bestaat niet.</p>
        ) : (
          <section className="rounded-xl border border-border p-4 text-sm">
            <p>Account: <span className="font-medium">{view.childEmail}</span></p>
            <p className="mt-2">Gevraagd: <span className="font-medium">{view.product.label ?? "Aankoop"}</span></p>
            {view.product.amountCents ? <p className="mt-1 text-lg font-semibold">€ {(view.product.amountCents / 100).toFixed(2).replace(".", ",")}</p> : null}
            <p className="mt-2 text-muted-foreground">Geldig tot {new Date(view.expiresAt).toLocaleString("nl-BE")}.</p>
            {view.status === "pending" ? (
              <Button className="mt-4 w-full" onClick={pay} disabled={busy}>Akkoord en betalen</Button>
            ) : (
              <p className="mt-4 font-medium">{view.status === "approved" ? "Deze betaling is al gestart." : "Deze link is verlopen."}</p>
            )}
          </section>
        )}
      </main>
    </AppLayout>
  );
}
