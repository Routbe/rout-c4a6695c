import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck, MailX, Send } from "lucide-react";
import { sendTestEmail } from "@/lib/email-test.functions";

/**
 * End-to-end e-mail probe.
 *
 * Sends one real ROUT auth mail: the server renders the ROUT template and hands
 * it to Brevo. A green result therefore proves the whole chain — API key,
 * sender domain, template rendering and delivery — instead of testing one link
 * in isolation.
 */
export function EmailFlowTester({ defaultEmail = "" }: { defaultEmail?: string }) {
  const send = useServerFn(sendTestEmail);
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    const to = email.trim();
    if (!to) {
      setResult({ ok: false, message: "Vul eerst een e-mailadres in." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await send({ data: { template: "magic-link", email: to } });
      setResult(
        res?.success
          ? {
              ok: true,
              message: `Verstuurd naar ${to} via Brevo. Controleer de inbox (en spam).`,
            }
          : {
              ok: false,
              message:
                ("error" in res ? res.error : null) ?? "Versturen mislukt — bekijk de serverlogs.",
            },
      );
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : "Versturen mislukt.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 pb-6 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">E-mailflow testen</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Stuurt een echte auth-mail via Brevo met het ROUT-template.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="email-flow-test" className="text-xs">
            Ontvanger
          </Label>
          <Input
            id="email-flow-test"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jij@rout.be"
            className="h-10 rounded-lg"
          />
        </div>
        <Button
          type="button"
          data-testid="send-test-email"
          onClick={() => void run()}
          disabled={busy}
          className="h-10 rounded-lg"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Test-e-mail versturen
        </Button>
      </div>
      {result && (
        <p
          className={`flex items-start gap-2 text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}
          role="status"
        >
          {result.ok ? (
            <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <MailX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {result.message}
        </p>
      )}
    </section>
  );
}
