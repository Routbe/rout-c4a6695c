import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestSecurityCode } from "@/lib/account-security.functions";

type Purpose = "identity_link" | "delete_account";

/** Sends a 6-digit e-mail code; the action that follows consumes it server-side. */
export function StepUpCodeField({ purpose, value, onChange }: { purpose: Purpose; value: string; onChange: (v: string) => void }) {
  const request = useServerFn(requestSecurityCode);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = (await request({ data: { purpose } })) as { ok: boolean; sentTo?: string; reason?: string };
      if (r.ok) setSentTo(r.sentTo ?? "je e-mailadres");
      else toast.error(r.reason === "rate_limited" ? "Te veel codes aangevraagd. Probeer later opnieuw." : "De code kon niet verstuurd worden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6-cijferige code"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-10 font-mono tracking-widest"
        />
        <Button type="button" variant="outline" onClick={send} disabled={busy} className="h-10 shrink-0">
          {sentTo ? "Opnieuw" : "Stuur code"}
        </Button>
      </div>
      {sentTo && <p className="text-xs text-muted-foreground">Code verstuurd naar {sentTo}. 10 minuten geldig.</p>}
    </div>
  );
}
