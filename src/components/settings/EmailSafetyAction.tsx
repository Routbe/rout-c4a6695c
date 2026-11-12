import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { confirmEmailChange, emergencyFreezeEmailChange } from "@/lib/auth/email-safety.functions";
import { withStepUp } from "@/components/auth/StepUpDialog";
export function EmailSafetyAction({ freeze }: { freeze: boolean }) {
  const search = useSearch({ strict: false }) as { token?: string };
  const confirm = useServerFn(confirmEmailChange), emergency = useServerFn(emergencyFreezeEmailChange);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  return <main className="mx-auto max-w-xl space-y-5 px-5 py-16"><h1 className="text-2xl font-semibold">{freeze ? "Account noodbevriezen" : "Nieuw e-mailadres bevestigen"}</h1>
    <p className="text-sm text-muted-foreground">{freeze ? "De wijziging wordt gestopt, het oude adres hersteld en actieve sessies ingetrokken." : "Bevestig met je passkey. Het oude adres blijft gedurende de veiligheidsperiode beschikbaar voor noodherstel."}</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    <Button disabled={busy || !search.token || message === "Voltooid."} onClick={async () => {
      if (!search.token) return; setBusy(true);
      try { if (freeze) await emergency({ data: { token: search.token } }); else await withStepUp(() => confirm({ data: { token: search.token ?? "" } })); setMessage("Voltooid."); }
      catch { setMessage("Deze link is verlopen, al gebruikt of vereist een ingelogd account met passkey."); }
      finally { setBusy(false); }
    }}>{freeze ? "Wijziging bevriezen" : "Bevestigen met passkey"}</Button>
  </main>;
}