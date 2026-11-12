import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { lookupPhysicalCardFn } from "@/lib/wallet/wallet.functions";

/** Printed metal-card QR: public identity display only, never authentication. */
export const Route = createFileRoute("/v/$cardId")({
  loader: ({ params }) => lookupPhysicalCardFn({ data: { cardId: params.cardId } }),
  head: () => ({
    meta: [
      { title: "ROUT Card · openbare kaartinfo" },
      { name: "description", content: "Openbare identiteitsinformatie van een fysieke ROUT Card. Geen toegang of betaling." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "ROUT Card · openbare kaartinfo" },
      { property: "og:description", content: "Openbare kaartinfo; toegang verloopt alleen via de NFC-chip." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PhysicalCard,
});

function PhysicalCard() {
  const r = Route.useLoaderData();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {"display_name" in r ? (
        <>
          {r.status === "blocked" ? <ShieldX className="h-14 w-14 text-destructive" aria-hidden /> : r.status === "active" ? <ShieldCheck className="h-14 w-14 text-primary" aria-hidden /> : <ShieldAlert className="h-14 w-14 text-muted-foreground" aria-hidden />}
          <h1 className="text-2xl font-bold">{r.status === "blocked" ? "Kaart geblokkeerd" : "ROUT Card"}</h1>
          <div className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left">
            {r.avatar_url && <img src={r.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />}
            <p className="text-lg font-semibold">{r.display_name}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Deze gedrukte code toont alleen openbare info en bewijst geen bezit. Toegang en betalingen werken uitsluitend via de NFC-chip.
          </p>
        </>
      ) : r.status === "limited" ? (
        <h1 className="text-2xl font-bold">Even wachten</h1>
      ) : (
        <>
          <ShieldX className="h-14 w-14 text-destructive" aria-hidden />
          <h1 className="text-2xl font-bold">Onbekende kaart</h1>
        </>
      )}
      <Link to="/" className="mt-4 text-xs text-muted-foreground hover:text-foreground">ROUT</Link>
    </main>
  );
}
