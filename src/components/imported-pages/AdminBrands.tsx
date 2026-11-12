import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listReservedBrandReleases, releaseReservedBrand } from "@/lib/brand-admin.functions";
import { RESERVED_BRANDS } from "@/lib/reserved-brands";
import { i18n as trI18n } from "@/lib/i18n";

type Release = { term: string; userId: string; email: string | null; username: string | null; evidence: string; createdAt: string };

/** Admin: release a protected brand name to one verified member. */
export default function AdminBrands() {
  const list = useServerFn(listReservedBrandReleases);
  const release = useServerFn(releaseReservedBrand);
  const [rows, setRows] = useState<Release[]>([]);
  const [term, setTerm] = useState("");
  const [member, setMember] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows((await list()) as Release[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    }
  }, [list]);
  useEffect(() => void refresh(), [refresh]);

  async function submit() {
    setBusy(true);
    try {
      await release({ data: { term, member, evidence } });
      toast.success(trI18n.t("ui.4af80110fb"));
      setTerm("");
      setMember("");
      setEvidence("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vrijgeven mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout title="Beschermde namen">
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-lg font-medium">Naam vrijgeven na verificatie</h2>
          <Input list="brand-terms" placeholder="Beschermde naam (bv. google)" value={term} onChange={(e) => setTerm(e.target.value)} />
          <datalist id="brand-terms">
            {RESERVED_BRANDS.map((b) => (
              <option key={b.term} value={b.term} />
            ))}
          </datalist>
          <Input placeholder="E-mailadres of handle van het lid" value={member} onChange={(e) => setMember(e.target.value)} />
          <Input placeholder="Bewijs (bv. KBO-nummer, merkregistratie, mailcontact)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <Button disabled={busy || !term || !member || evidence.length < 3} onClick={submit}>
            Vrijgeven
          </Button>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-lg font-medium">Vrijgaven</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen vrijgaven.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {rows.map((r) => (
                <li key={`${r.term}-${r.userId}`} className="py-2">
                  <span className="font-medium text-foreground">{r.term}</span> → {r.username ? `@${r.username}` : r.email ?? r.userId}
                  <p className="text-xs text-muted-foreground">{r.evidence} · {new Date(r.createdAt).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
