import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { checkIntegrationVerify, getMyRoutUsername } from "@/lib/integrations.functions";
import type { BioProvider } from "@/lib/open-web-rules";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * "Handmatig verifiëren": the member puts their own link rout.be/<username>
 * in the public bio of the platform; the server reads the live bio and
 * checks it with a strict word-boundary match.
 */
export function VerifyOwnership({
  provider,
  label,
  onVerified,
}: {
  provider: BioProvider;
  label: string;
  onVerified: () => void;
}) {
  const check = useServerFn(checkIntegrationVerify);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const fetchName = useServerFn(getMyRoutUsername);
  const me = useQuery({ queryKey: ["my-rout-username"], queryFn: () => fetchName(), enabled: open, staleTime: 300_000 });
  const username = me.data?.username ?? null;
  const link = `rout.be/${username ?? "…"}`;

  const run = async () => {
    setBusy(true);
    setHint(null);
    try {
      const { result } = await check({ data: { provider } });
      if (result === "verified") {
        toast.success(`${label} geverifieerd via bio`);
        setOpen(false);
        onVerified();
      } else if (result === "unreachable") {
        setHint(`We konden je ${label}-profiel nu niet openen. Controleer je gebruikersnaam en probeer het over 1 minuut nog eens.`);
      } else {
        setHint(
          "We konden de link nog niet vinden. Let op: sommige platforms (zoals Chess.com) hebben enkele minuten nodig om je bio-update zichtbaar te maken. Probeer het over 1 minuut nog eens.",
        );
      }
    } catch {
      toast.error(trI18n.t("ui.0592745d21"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => { setHint(null); setOpen(true); }} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/50 text-xs font-medium text-primary hover:bg-primary/10">
        <ShieldCheck className="h-3.5 w-3.5" />
        Handmatig verifiëren
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verifieer je {label}-account</DialogTitle>
            <DialogDescription>
              Zet de link <strong>{link}</strong> in je korte bio of profielbeschrijving op {label}. Sla op en klik daarna op Controleer.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            disabled={!username}
            onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success(trI18n.t("ui.f3042d3d49")))}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm"
          >
            {link}
            <Copy className="h-4 w-4" aria-label="Kopieer link" />
          </button>
          {hint && <p className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">{hint}</p>}
          <DialogFooter>
            <button type="button" onClick={() => void run()} disabled={busy || !username} className={`relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 ${busy ? "animate-pulse" : ""}`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Bezig met controleren…" : "Controleer"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
