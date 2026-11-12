import { useState } from "react";
import { Copy, Download, FileText, Printer, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

/**
 * Shows the 10 one-time recovery codes exactly once. `onSaved` fires only after the
 * member copied, downloaded or printed them AND confirmed — the caller enables 2FA after that.
 */
export function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: (saved: boolean) => void }) {
  const [secured, setSecured] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const text = `ROUT herstelcodes (elk 1x bruikbaar)\n${new Date().toISOString().slice(0, 10)}\n\n${codes.join("\n")}\n`;

  const mark = () => setSecured(true);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success("Codes gekopieerd");
    mark();
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rout-herstelcodes.txt";
    a.click();
    URL.revokeObjectURL(url);
    mark();
  };
  const print = () => {
    const w = window.open("", "_blank", "noopener,width=480,height=640");
    if (!w) return toast.error("Pop-up geblokkeerd");
    w.document.title = "ROUT herstelcodes";
    const pre = w.document.createElement("pre");
    pre.style.font = "16px monospace";
    pre.textContent = text;
    w.document.body.appendChild(pre);
    w.print();
    mark();
  };

  const pdf = async () => {
    try {
      const { buildEmergencyKitPdf, downloadBlob } = await import("@/lib/recovery/emergency-kit");
      const { kitFileName } = await import("@/lib/recovery/vault-rules");
      downloadBlob(await buildEmergencyKitPdf({ kind: "codes", items: codes }), kitFileName("codes", new Date(), "pdf"));
      mark();
    } catch {
      toast.error("De noodkit kon niet gemaakt worden. Kopieer of download de codes.");
    }
  };

  return (
    <div className="w-full space-y-3 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4" aria-hidden /> Bewaar je 10 herstelcodes
      </p>
      <p className="text-xs text-muted-foreground">
        Elke code werkt één keer als je je toestel kwijt bent. We tonen ze nu één keer en bewaren alleen een onleesbare vingerafdruk.
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-2 font-mono text-sm">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}><Copy className="mr-1 h-3.5 w-3.5" />Kopiëren</Button>
        <Button type="button" variant="outline" size="sm" onClick={download}><Download className="mr-1 h-3.5 w-3.5" />Downloaden</Button>
        <Button type="button" variant="outline" size="sm" onClick={print}><Printer className="mr-1 h-3.5 w-3.5" />Printen</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void pdf()}><FileText className="mr-1 h-3.5 w-3.5" />Noodkit (PDF)</Button>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <Checkbox
          checked={confirmed}
          disabled={!secured}
          onCheckedChange={(v) => {
            const ok = v === true;
            setConfirmed(ok);
            onSaved(ok && secured);
          }}
          className="mt-0.5"
        />
        <span>{secured ? "Ik heb mijn herstelcodes veilig bewaard." : "Kopieer, download of print je codes eerst."}</span>
      </label>
    </div>
  );
}
