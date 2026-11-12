import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmReviewDecision, getReviewPreview } from "@/lib/review.functions";

const TITLE = "Aanvraag beoordelen — ROUT";
const DESC = "Bevestig een goedkeuring of afwijzing van een verificatieaanvraag bij ROUT.";

export const Route = createFileRoute("/review/$token")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

type Preview = Awaited<ReturnType<typeof getReviewPreview>>;

function ReviewPage() {
  const { token } = Route.useParams();
  const load = useServerFn(getReviewPreview);
  const confirm = useServerFn(confirmReviewDecision);
  const [p, setP] = useState<Preview | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void load({ data: { token } }).then(setP).catch(() => setP({ ok: false, reason: "invalid" }));
  }, [load, token]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await confirm({ data: { token, note: note || null } });
      setResult(r.ok ? (r.done === "approved" ? "Goedgekeurd. Het lid krijgt een e-mail." : "Afgewezen. Het lid krijgt een e-mail.") : r.reason ?? "Mislukt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-5 px-6 py-16">
      {!p ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : !p.ok ? (
        <p className="text-destructive">Deze link is ongeldig, verlopen of de aanvraag bestaat niet meer.</p>
      ) : result ? (
        <p className="text-lg">{result}</p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">
            {p.action === "approve" ? "Goedkeuren" : "Afwijzen"}: {p.kind === "influencer" ? "creator" : "bedrijf"}
          </h1>
          <dl className="space-y-1 rounded-lg border border-border p-4 text-sm">
            <div><dt className="inline text-muted-foreground">Aanvrager: </dt><dd className="inline">{p.applicant}{p.handle ? ` (@${p.handle})` : ""}</dd></div>
            <div><dt className="inline text-muted-foreground">Aanvraag: </dt><dd className="inline">{p.subject || "—"}</dd></div>
            {p.reach !== null && (
              <div><dt className="inline text-muted-foreground">Bereik: </dt><dd className="inline">{p.reach.toLocaleString("nl-BE")}</dd></div>
            )}
          </dl>
          {!p.open ? (
            <p className="text-muted-foreground">Deze aanvraag is al afgehandeld ({p.status}). Er verandert niets.</p>
          ) : p.action === "approve" && p.belowReach ? (
            <p className="text-destructive">Onder de {p.minReach.toLocaleString("nl-BE")} volgers — goedkeuren kan niet.</p>
          ) : (
            <>
              {p.action === "reject" && (
                <Textarea placeholder="Reden (optioneel, het lid ziet dit)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />
              )}
              <p className="text-sm text-muted-foreground">Er verandert pas iets als je hieronder bevestigt.</p>
              <Button onClick={() => void submit()} disabled={busy} variant={p.action === "reject" ? "destructive" : "default"}>
                {busy ? "Bezig…" : p.action === "approve" ? "Ja, goedkeuren" : "Ja, afwijzen"}
              </Button>
            </>
          )}
        </>
      )}
    </main>
  );
}
