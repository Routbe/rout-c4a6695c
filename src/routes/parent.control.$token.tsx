import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { approveParentConsent, getParentView, setParentQaLevel } from "@/lib/parent.functions";
import { QA_LEVELS, QA_LEVEL_LABELS, type QaLevel } from "@/lib/minor-safety";
import { i18n as trI18n } from "@/lib/i18n";

export const Route = createFileRoute("/parent/control/$token")({
  loader: ({ params }) => getParentView({ data: { token: params.token } }).catch(() => ({ view: null })),
  head: () => ({
    meta: [
      { title: "Ouderlijk beheer" },
      { name: "description", content: "Geef toestemming en beheer de veiligheidsinstellingen van het ROUT-account van je kind." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Ouderlijk beheer — ROUT" },
      { property: "og:description", content: "Toestemming en veiligheidsinstellingen voor minderjarigen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParentControl,
});

function ParentControl() {
  const { token } = Route.useParams();
  const { view } = Route.useLoaderData();
  const approve = useServerFn(approveParentConsent);
  const setLevel = useServerFn(setParentQaLevel);
  const [consent, setConsent] = useState(view?.consent ?? "none");
  const [level, setLvl] = useState<QaLevel>(view?.qaLevel ?? "verified_only");
  const [busy, setBusy] = useState(false);

  if (!view || view.action !== "consent") {
    return (
      <AppLayout>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">Link niet gevonden</h1>
          <p className="mt-2 text-sm text-muted-foreground">Deze beheerlink bestaat niet of is verlopen.</p>
        </main>
      </AppLayout>
    );
  }
  const closed = view.status === "expired" && consent !== "approved";

  const doApprove = async () => {
    setBusy(true);
    try {
      const r = await approve({ data: { token } });
      if (r.ok) { setConsent("approved"); toast.success(trI18n.t("ui.12693daa2e")); } else toast.error(trI18n.t("ui.f2ddbda143"));
    } finally { setBusy(false); }
  };
  const pick = async (l: QaLevel) => {
    const prev = level;
    setLvl(l);
    const r = await setLevel({ data: { token, level: l } }).catch(() => ({ ok: false }));
    if (r.ok) toast.success(trI18n.t("ui.7fc72e80f3")); else { setLvl(prev); toast.error(trI18n.t("ui.b7b1d11d92")); }
  };

  return (
    <AppLayout>
      <main className="mx-auto max-w-lg space-y-6 px-4 py-12">
        <header className="space-y-2">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold">Ouderlijk beheer</h1>
          <p className="text-sm text-muted-foreground">Account: <span className="font-medium text-foreground">{view.childEmail}</span></p>
        </header>

        <section className="rounded-xl border border-border p-4">
          <h2 className="font-medium">Toestemming</h2>
          {consent === "approved" ? (
            <p className="mt-1 text-sm text-muted-foreground">Je hebt toestemming gegeven. Bewaar deze link om de instellingen later te wijzigen.</p>
          ) : closed ? (
            <p className="mt-1 text-sm text-muted-foreground">Deze toestemmingslink is verlopen.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Tot je akkoord gaat, blijft het account beperkt.</p>
              <Button className="mt-3" onClick={doApprove} disabled={busy}>Ik geef toestemming</Button>
            </>
          )}
        </section>

        <section className="rounded-xl border border-border p-4">
          <h2 className="font-medium">Wie mag berichten sturen?</h2>
          <div className="mt-3 space-y-2" role="radiogroup" aria-label="Berichtniveau">
            {QA_LEVELS.map((l) => {
              const info = QA_LEVEL_LABELS[l];
              return (
                <button key={l} type="button" role="radio" aria-checked={level === l} disabled={closed}
                  onClick={() => pick(l)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-50 ${level === l ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  <span className="font-medium">Niveau {info.n} · {info.title}</span>
                  <span className="block text-muted-foreground">{info.body}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
