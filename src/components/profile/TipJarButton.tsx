import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Coffee } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTipJarQr } from "@/lib/tip-page.functions";

type Theme = { card: string; border: string; text: string; muted: string };
const euro = (c: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(c / 100);

/** "Trakteer op een koffie": scannable EPC bank QR, straight to the creator's IBAN. Hidden when not set up. */
export function TipJarButton({ handle, theme }: { handle: string; theme: Theme }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["tip-jar", handle], queryFn: () => getTipJarQr({ data: { handle } }), staleTime: 300_000 });
  const tip = q.data;
  if (!tip) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition hover:opacity-90 ${theme.card} ${theme.border} ${theme.text}`}
      >
        <Coffee className="h-4 w-4" aria-hidden />  {t("profile.tipButton")} </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle> {t("profile.tipPrefix")} {tip.handle}  {t("profile.tipSuffix")} </DialogTitle>
            <DialogDescription> {t("profile.tipExplanation")} </DialogDescription>
          </DialogHeader>
          <div className="mx-auto rounded-2xl bg-background p-4 text-foreground">
            <QRCodeSVG value={tip.payload} size={220} level="M" marginSize={0} bgColor="transparent" fgColor="currentColor" aria-label={`Bank-QR voor ${euro(tip.amountCents)}`} />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {euro(tip.amountCents)}  {t("profile.toRecipient")} {tip.accountName}
          </p>
          <Link to="/u/$username/tip" params={{ username: tip.handle }} search={{ donation: undefined, status: undefined }} className="text-center text-xs text-primary underline-offset-4 hover:underline">
             {t("profile.chooseAmount")} </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
