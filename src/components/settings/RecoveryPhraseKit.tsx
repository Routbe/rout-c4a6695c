import { useState } from "react";
import { Copy, Download, FileText, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { kitFileName, numberedWords, phraseConfirmed } from "@/lib/recovery/vault-rules";

/**
 * Shows a freshly generated 24-word phrase once, with copy, text download and a
 * local Emergency Kit PDF. `onConfirmed` turns true only after the phrase left the
 * screen and the member ticked the box.
 */
export function RecoveryPhraseKit({ mnemonic, account, onConfirmed }: { mnemonic: string; account?: string | null; onConfirmed: (ok: boolean) => void }) {
  const [secured, setSecured] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const words = numberedWords(mnemonic) ?? [];
  const mark = () => { setSecured(true); onConfirmed(phraseConfirmed({ secured: true, ticked })); };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      toast.success("Herstelwoorden gekopieerd. Plak ze in je wachtwoordmanager en wis daarna je klembord.");
      mark();
    } catch {
      toast.error("Kopiëren lukte niet. Download ze of schrijf ze over.");
    }
  };
  const download = async () => {
    const { downloadBlob } = await import("@/lib/recovery/emergency-kit");
    const text = `ROUT herstelwoorden\n${new Date().toISOString().slice(0, 10)}\n\n${words.map((w) => `${String(w.n).padStart(2, "0")}. ${w.word}`).join("\n")}\n\nBewaar dit offline. ROUT vraagt nooit naar deze woorden.\n`;
    downloadBlob(new Blob([text], { type: "text/plain" }), kitFileName("phrase", new Date(), "txt"));
    mark();
  };
  const pdf = async () => {
    setBusy(true);
    try {
      const { buildEmergencyKitPdf, downloadBlob } = await import("@/lib/recovery/emergency-kit");
      downloadBlob(await buildEmergencyKitPdf({ kind: "phrase", items: [mnemonic], account }), kitFileName("phrase", new Date(), "pdf"));
      mark();
    } catch {
      toast.error("De noodkit kon niet gemaakt worden. Kopieer of download de woorden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Je 24 herstelwoorden. Je ziet ze nu één keer.
      </p>
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label="Herstelwoorden">
        {words.map((w) => (
          <li key={w.n} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 font-mono text-sm">
            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{w.n}</span>
            <span className="truncate">{w.word}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" variant="soft" onClick={() => void copy()}><Copy /> Kopiëren</Button>
        <Button type="button" variant="soft" onClick={() => void download()}><Download /> Downloaden (.txt)</Button>
        <Button type="button" variant="soft" disabled={busy} onClick={() => void pdf()}><FileText /> Noodkit (PDF)</Button>
      </div>
      <p className="text-xs text-muted-foreground">De noodkit wordt in je browser gemaakt en nooit naar ROUT gestuurd. Print hem en bewaar hem offline.</p>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={ticked} disabled={!secured} className="mt-0.5" onCheckedChange={(v) => { const ok = v === true; setTicked(ok); onConfirmed(phraseConfirmed({ secured, ticked: ok })); }} />
        <span>{secured ? "Ik heb mijn 24 herstelwoorden veilig bewaard." : "Kopieer, download of print je woorden eerst."}</span>
      </label>
    </div>
  );
}
