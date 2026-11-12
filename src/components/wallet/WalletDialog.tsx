import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getWalletStatus } from "@/lib/wallet/wallet.functions";
import type { WalletKind, WalletStatus } from "@/lib/wallet/wallet-pass";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; kind: WalletKind; id: string };

/** "Add to Wallet": Apple (.pkpass download) or Google (save link), with a friendly fallback. */
export function WalletDialog({ open, onOpenChange, kind, id }: Props) {
  const { t } = useTranslation();
  const status = useServerFn(getWalletStatus);
  const [state, setState] = useState<WalletStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || state) return;
    status().then(setState).catch(() => setState({ apple: false, google: false }));
  }, [open, state, status]);

  const href = (type: "apple" | "google") => `/api/wallet/${kind}/${encodeURIComponent(id)}?type=${type}`;

  const addApple = async () => {
    setBusy(true);
    try {
      const res = await fetch(href("apple"));
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-${kind}.pkpass`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(false);
    }
  };

  const none = state && !state.apple && !state.google;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" aria-hidden /> {t("wallet.title")}
          </DialogTitle>
          <DialogDescription>{t(kind === "event" ? "wallet.descEvent" : "wallet.descProfile")}</DialogDescription>
        </DialogHeader>
        {!state ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        ) : none ? (
          <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm">{t("wallet.unavailable")}</p>
        ) : (
          <div className="grid gap-2">
            <Button type="button" variant="outline" disabled={!state.apple || busy} onClick={() => void addApple()}>
              {t("wallet.apple")}
            </Button>
            {state.google ? (
              <Button variant="outline" asChild>
                <a href={href("google")} target="_blank" rel="noopener noreferrer">{t("wallet.google")}</a>
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled>{t("wallet.google")}</Button>
            )}
            {(!state.apple || !state.google) && <p className="text-xs text-muted-foreground">{t("wallet.partly")}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
