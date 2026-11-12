import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Clipboard, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { analyzeContactMessage } from "@/lib/contact-admin.functions";
import { contactTriageInput, type ContactTriage } from "@/lib/contact-triage";

export function ContactTriagePanel({ initialMessage = "" }: { initialMessage?: string }) {
  const analyze = useServerFn(analyzeContactMessage);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContactTriage | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const submit = async () => {
    const input = contactTriageInput.safeParse({ message });
    if (!input.success) { setError("Vul een bericht van 10 tot 10.000 tekens in."); return; }
    setBusy(true); setError(""); setResult(null); setCopied(false);
    try {
      const response = await analyze({ data: input.data });
      if (response.ok) setResult(response.result);
    } catch { setError("De analyse is niet beschikbaar. Controleer je supportrechten en probeer opnieuw."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 border-y border-border py-6" aria-labelledby="contact-triage-title">
    <h2 id="contact-triage-title" className="flex items-center gap-2 font-display text-xl"><Sparkles className="size-4 text-accent" aria-hidden />Contactanalyse</h2>
    <Label htmlFor="contact-triage-message">Contactbericht</Label>
    <Textarea id="contact-triage-message" value={message} maxLength={10000} rows={5} disabled={busy} onChange={e => { setMessage(e.target.value); setResult(null); setCopied(false); }} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{message.length.toLocaleString("nl-BE")} / 10.000</span>
      <Button onClick={() => void submit()} disabled={busy || message.trim().length < 10}><span aria-hidden>{busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}</span>{busy ? "Analyseren…" : "Samenvatten en categoriseren"}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div aria-live="polite" className="space-y-4 border-l-2 border-accent pl-4 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-2"><p><span className="text-muted-foreground">Categorie: </span>{result.category}</p><p><span className="text-muted-foreground">Prioriteit: </span>{result.priority}</p></div>
      <div><h3 className="font-sans text-sm font-semibold">Samenvatting</h3><p className="mt-1 whitespace-pre-line break-words">{result.summary}</p></div>
      <div><h3 className="font-sans text-sm font-semibold">Opvolging</h3><p className="mt-1 whitespace-pre-line break-words">{result.nextStep}</p></div>
      <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(`${result.category} · ${result.priority}\n${result.summary}\nOpvolging: ${result.nextStep}`); setCopied(true); } catch { setError("Kopiëren is niet beschikbaar in deze browser."); } }}><Clipboard className="size-4" />{copied ? "Gekopieerd" : "Kopieer opvolging"}</Button>
    </div>}
  </section>;
}