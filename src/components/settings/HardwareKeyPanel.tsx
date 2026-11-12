import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";
import { requestStepUp } from "@/components/auth/StepUpDialog";
import { refreshSessionFreshness } from "@/lib/auth/step-up.functions";

export const HARDWARE_KEY_PREFIX = "Security key";

/** FIDO2/U2F roaming authenticators (YubiKey etc.), registered separately from platform passkeys. */
export function HardwareKeyPanel() {
  const [keys, setKeys] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await authClient.passkey.listUserPasskeys();
    const rows = ((res.data ?? []) as { id: string; name?: string | null }[]).filter((p) => p.name?.startsWith(HARDWARE_KEY_PREFIX));
    setKeys(rows.map((p) => ({ id: p.id, name: p.name ?? HARDWARE_KEY_PREFIX })));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const add = async () => {
    setBusy(true);
    try {
      const name = `${HARDWARE_KEY_PREFIX} ${(keys?.length ?? 0) + 1}`;
      const run = () => authClient.passkey.addPasskey({ name, authenticatorAttachment: "cross-platform" } as never);
      let res = await run();
      const code = (res?.error as { code?: string } | undefined)?.code;
      if (code === "SESSION_NOT_FRESH") {
        if (!(await requestStepUp())) return;
        await refreshSessionFreshness();
        res = await run();
      }
      if (res?.error) return toast.error(res.error.message ?? "Sleutel kon niet geregistreerd worden.");
      toast.success("Beveiligingssleutel toegevoegd");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registratie geannuleerd.");
    } finally {
      setBusy(false);
    }
  };

  const active = (keys?.length ?? 0) > 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" aria-hidden /> Hardware-beveiligingssleutel</p>
        <p className="text-xs text-muted-foreground">FIDO2/U2F-sleutel zoals een YubiKey. {active ? `${keys!.length} geregistreerd.` : "Sterkste bescherming tegen phishing."}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={active ? "default" : "secondary"}>{active ? "Actief" : "Inactief"}</Badge>
        <Button size="sm" variant="outline" onClick={add} disabled={busy || keys === null}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sleutel toevoegen"}
        </Button>
      </div>
    </div>
  );
}
