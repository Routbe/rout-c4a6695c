import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getProWaitlist, joinProWaitlist } from "@/lib/pro.functions";

const FEATURES = [
  "Native Video Uploads",
  "Geavanceerde Integraties",
  "Eigen Domeinnaam",
  "Geen ROUT Watermerk",
];

/** "Upgrade naar ROUT Pro" — UI only; the waitlist is the only stored effect. */
export function ProUpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const load = useServerFn(getProWaitlist);
  const join = useServerFn(joinProWaitlist);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void load()
      .then((r) => setJoined(r.joined))
      .catch(() => undefined);
  }, [open, load]);

  const onJoin = async () => {
    setBusy(true);
    try {
      await join();
      setJoined(true);
    } catch {
      toast.error(t("studio.pro.waitlistError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className="bg-gradient-to-br from-primary/25 via-primary/5 to-transparent px-6 pb-4 pt-7">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/40 bg-background/60">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="font-display text-2xl tracking-tight">{t("studio.pro.title")}</DialogTitle>
            <DialogDescription>{t("studio.pro.description")}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-5 px-6 pb-6">
          <ul className="space-y-2.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-3 w-3 text-primary" aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            Binnenkort beschikbaar voor <strong>€7,99 / maand</strong>.
          </p>
          <Button className="w-full" disabled={joined || busy} onClick={() => void onJoin()}>
            {joined ? (
              <>
                <Check className="mr-1.5 h-4 w-4" aria-hidden /> {t("studio.pro.joined")} </>
            ) : (
              t("studio.pro.join")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
