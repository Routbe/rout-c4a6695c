import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { approveRecoveryRequestFn, denyRecoveryRequestFn, listRecoveryRequestsFn } from "@/lib/auth/quarantine.functions";

type Row = Awaited<ReturnType<typeof listRecoveryRequestsFn>>[number];

/**
 * Passkey-herstel: accounts zonder passkey staan in quarantaine. Keur pas goed
 * NA een identiteitscontrole via een vertrouwd kanaal (telefoon, videogesprek,
 * bekende contactpersoon). De herstellink verschijnt één keer en werkt één keer, 24 uur.
 */
export function AdminRecoveryQueue() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; link: string } | null>(null);

  const load = useCallback(() => {
    listRecoveryRequestsFn().then(setRows).catch(() => {
      setRows([]);
      toast.error("Kon de aanvragen niet laden.");
    });
  }, []);
  useEffect(load, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const data = { id, note: notes[id] ?? null };
      if (approve) {
        const res = await approveRecoveryRequestFn({ data });
        if (!res.ok) toast.error("Deze aanvraag is niet meer open.");
        else setIssued({ id, link: res.link });
      } else {
        const res = await denyRecoveryRequestFn({ data });
        toast[res.ok ? "success" : "error"](res.ok ? "Aanvraag geweigerd." : "Deze aanvraag is niet meer open.");
      }
      load();
    } catch {
      toast.error("Actie mislukt.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
        <header>
          <h1 className="font-display text-2xl text-foreground">Passkey-herstel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts zonder passkey kunnen niet inloggen. Keur een aanvraag pas goed nadat je de persoon buiten ROUT hebt geverifieerd.
            De link is eenmalig, 24 uur geldig en wordt maar één keer getoond.
          </p>
        </header>

        {issued && (
          <div className="space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">Herstellink (alleen nu zichtbaar) — bezorg via het geverifieerde kanaal:</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs">{issued.link}</code>
              <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(issued.link).then(() => toast.success("Gekopieerd"))}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>Verbergen</Button>
          </div>
        )}

        {rows === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Geen herstelaanvragen.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{r.email}</span>
                  <Badge variant={r.status === "pending" ? "default" : "secondary"}>{r.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Aangevraagd {new Date(r.created_at).toLocaleString("nl-BE")}</p>
                {r.note && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-sm text-foreground">{r.note}</p>}
                {r.status === "pending" && (
                  <>
                    <Textarea
                      rows={2}
                      maxLength={1000}
                      placeholder="Hoe heb je de identiteit gecontroleerd? (verplicht voor goedkeuring)"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === r.id || !(notes[r.id] ?? "").trim()} onClick={() => void decide(r.id, true)} className="gap-1.5">
                        <Check className="h-4 w-4" /> Goedkeuren
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void decide(r.id, false)} className="gap-1.5">
                        <X className="h-4 w-4" /> Weigeren
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
