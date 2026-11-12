import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { euro } from "@/lib/profile";
import { useI18n } from "@/lib/i18n";

interface BunqPaymentCardProps {
  /** Officiële bunq.me-betaallink (doel van QR + knop). */
  shareUrl: string;
  /** ROUT-referentie die al in de bunq.me-link is ingebakken. */
  reference?: string;
  /** Totaalbedrag in centen. */
  amountCents: number;
  /** Live betaalstatus, gevoed door de bankwebhook of de live polling. */
  status: "pending" | "processing" | "paid" | "timeout";
  /** Link naar het geverifieerde profiel, getoond in de succesbevestiging. */
  profileUrl?: string | null;
  /** Start een nieuwe wachtronde nadat de polling is afgekapt. */
  onRetry?: () => void;
}

/**
 * bunq-betalingskaart: bovenaan de officiële bunq-QR en de directe
 * betaalknop, daaronder de handmatige IBAN/ROUT-referentie als stille
 * EUR/SEPA-fallback.
 */
export function BunqPaymentCard({
  shareUrl,
  amountCents,
  status,
  profileUrl,
  onRetry,
}: BunqPaymentCardProps) {
  const { t } = useI18n();
  // Betaling gedetecteerd: één strakke bevestiging in plaats van de QR-flow.
  if (status === "paid") {
    return (
      <div className="animate-in fade-in zoom-in-95 space-y-3 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-5 text-center duration-500">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/60 bg-background">
          <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {t("pay.bunq.paid")}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("pay.bunq.success_hint")}</p>
        {profileUrl && (
          <Button
            className="h-11 w-full rounded-xl text-sm font-semibold"
            onClick={() => window.location.assign(profileUrl)}
          >
            {t("pay.bunq.view_profile")}
          </Button>
        )}
      </div>
    );
  }

  // Wachttijd verstreken: polling staat stil, gebruiker kiest zelf opnieuw.
  if (status === "timeout") {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-center">
        <p role="alert" className="text-sm font-semibold text-foreground">
          Betaling niet gedetecteerd of verlopen. Probeer opnieuw.
        </p>
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl text-sm font-semibold"
          onClick={() => onRetry?.()}
        >
          Probeer opnieuw
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted p-3">
      {/* Statusindicator — 'paid' is hierboven al afgehandeld. */}
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t("pay.bunq.waiting")}
      </div>

      {/* Officiële bunq-betaallink */}
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-4">
        <QRCodeSVG value={shareUrl} size={168} level="M" aria-label={t("pay.bunq.qr_alt")} />
        <Button
          className="h-11 w-full rounded-xl text-sm font-semibold"
          onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
          {t("pay.bunq.pay_direct", { total: euro(amountCents) })}
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          {t("pay.bunq.scan_hint")}
        </p>
      </div>

      {/* Referentie en bedrag zitten al ingebakken in de bunq.me-link, dus het
          kopieerblok hoort uitsluitend bij de handmatige overschrijving. */}
    </div>
  );
}
