import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendManualInvoice } from "@/lib/manual-invoice.functions";
import { i18n as trI18n } from "@/lib/i18n";

interface Line {
  id: string;
  label: string;
  amount: string;
}

const newLine = (): Line => ({
  id: `line_${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  amount: "",
});

/**
 * Zelf een factuur opmaken: regels invullen of een eigen bestand uploaden,
 * en het resultaat als bijlage naar je eigen e-mailadres sturen.
 */
export function ManualInvoicePanel() {
  const send = useServerFn(sendManualInvoice);
  const [title, setTitle] = useState("Factuur");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (id: string, changes: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...changes } : l)));

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/*";
    input.onchange = () => {
      const picked = input.files?.[0];
      if (!picked) return;
      if (picked.size > 4_000_000) {
        toast.error(trI18n.t("ui.2aefca009a"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        setFile({ name: picked.name, base64: result.slice(result.indexOf(",") + 1) });
      };
      reader.readAsDataURL(picked);
    };
    input.click();
  };

  const submit = async () => {
    if (title.trim().length < 2) {
      toast.error(trI18n.t("ui.12ee3af692"));
      return;
    }
    setBusy(true);
    try {
      const res = await send({
        data: {
          title: title.trim(),
          lines: lines
            .filter((l) => l.label.trim())
            .map((l) => ({
              label: l.label.trim(),
              amountCents: Math.round((Number(l.amount.replace(",", ".")) || 0) * 100),
            })),
          note: note.trim() || null,
          fileBase64: file?.base64 ?? null,
          fileName: file?.name ?? null,
        },
      });
      if (!res.ok) {
        toast.error(
          res.message === "geen_emailadres"
            ? "Er staat geen e-mailadres op je account."
            : "Aanmaken lukte niet.",
        );
        return;
      }
      toast.success(
        res.emailed
          ? `${res.filename} is naar je mailbox verstuurd.`
          : `${res.filename} is aangemaakt, maar de e-mail kon niet verstuurd worden.`,
      );
    } catch (error) {
      console.error("[factuur] versturen mislukt", error);
      toast.error(trI18n.t("ui.b5e03701a8"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-medium">Factuur aanmaken &amp; mailen</h2>
        <p className="text-sm text-muted-foreground">
          Vul de regels in of upload je eigen bestand. Je krijgt het document meteen als bijlage in
          je mailbox.
        </p>
      </div>

      <Input
        value={title}
        maxLength={80}
        aria-label="Titel van de factuur"
        placeholder="Titel, bv. Factuur maart"
        onChange={(e) => setTitle(e.target.value)}
        className="h-9 text-xs"
      />

      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2">
            <Input
              value={line.label}
              maxLength={80}
              placeholder="Omschrijving"
              aria-label="Omschrijving"
              onChange={(e) => patch(line.id, { label: e.target.value })}
              className="h-9 flex-1 text-xs"
            />
            <Input
              value={line.amount}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Bedrag in euro"
              onChange={(e) => patch(line.id, { amount: e.target.value })}
              className="h-9 w-24 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Regel verwijderen"
              onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setLines((prev) => [...prev, newLine()])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Regel toevoegen
        </Button>
      </div>

      <Textarea
        value={note}
        maxLength={400}
        placeholder="Notitie in de e-mail (optioneel)"
        aria-label="Notitie"
        onChange={(e) => setNote(e.target.value)}
        className="min-h-16 text-xs"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={pickFile}>
          <Upload className="h-3.5 w-3.5" aria-hidden /> Eigen bestand uploaden
        </Button>
        {file && (
          <span className="text-xs text-muted-foreground">
            {file.name}{" "}
            <button
              type="button"
              className="underline hover:text-destructive"
              onClick={() => setFile(null)}
            >
              verwijderen
            </button>
          </span>
        )}
      </div>

      <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void submit()}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Mail className="h-3.5 w-3.5" aria-hidden />
        )}
        Aanmaken &amp; mailen
      </Button>
    </section>
  );
}
