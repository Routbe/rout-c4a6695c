import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifySuccess } from "@/lib/notify";
import { SEPA_DETAILS } from "@/lib/profile";
import { formatCurrency } from "@/lib/format";
import { buildLocalPaymentQr } from "@/lib/local-payment-qr";
import { TransferLifecycle } from "@/components/dashboard/TransferLifecycle";

import type { BankTransferDetails } from "@/lib/bank-transfer.functions";

interface SepaTransferCardProps {
  /** `ROUT-XXXX` reference the bank transfer must carry. */
  reference: string;
  /** Exact amount to transfer, in cents. */
  amountCents: number;
  /** Live payment state, driven by the webhook / admin match. */
  status: "pending" | "processing" | "paid";
  /** Land-/valuta-specifieke bankrekening uit bunq (null = nog niet bekend). */
  bank?: BankTransferDetails | null;
  /** Status van de bankgegevens-lookup voor het gekozen land. */
  bankState?: "loading" | "ok" | "unavailable" | "bunqme";
  /** Dynamische bunq.me-link in de vreemde valuta (fallback zonder subrekening). */
  bunqmeUrl?: string | null;
  /** Valuta van het gekozen land, voor de fallback-teksten. */
  currency?: string;
}

/**
 * Adaptive bank transfer surface. De bankgegevens zijn land-/valuta-specifiek:
 * EUR/SEPA krijgt altijd een IBAN (lokaal of de centrale hoofdrekening), USD
 * routing- + rekeningnummer, GBP sort code + rekeningnummer. Bestaat er voor
 * een vreemde valuta geen subrekening, dan volgt een bunq.me-verzoek in die
 * valuta en pas als laatste een melding om via Kaart of bunq af te rekenen.
 */
export function SepaTransferCard({
  reference,
  amountCents,
  status,
  bank = null,
  bankState = "ok",
  bunqmeUrl = null,
  currency: countryCurrency = "EUR",
}: SepaTransferCardProps) {
  const [copied, setCopied] = useState(false);

  const beneficiary = bank?.holder ?? SEPA_DETAILS.beneficiary;
  const iban = bank?.iban ?? (bank ? null : SEPA_DETAILS.iban);
  const bic = bank?.bic ?? (bank ? null : SEPA_DETAILS.bic);
  const currency = bank?.currency ?? "EUR";
  const money = formatCurrency(amountCents, "nl", currency);

  /** Alle regels van het kopieerbare vak — één bron voor UI én klembord. */
  const rows: {
    label: string;
    value: string;
    mono?: boolean;
    copyable?: boolean;
    testId?: string;
  }[] = [
    { label: "Begunstigde", value: beneficiary, copyable: true },
    ...(bank?.routingNumber
      ? [
          {
            label: "Routingnummer",
            value: bank.routingNumber,
            mono: true,
            copyable: true,
            testId: "bank-routing",
          },
        ]
      : []),
    ...(bank?.sortCode
      ? [
          {
            label: "Sort code",
            value: bank.sortCode,
            mono: true,
            copyable: true,
            testId: "bank-sort-code",
          },
        ]
      : []),
    ...(bank?.accountNumber
      ? [
          {
            label: "Rekeningnummer",
            value: bank.accountNumber,
            mono: true,
            copyable: true,
            testId: "bank-account-number",
          },
        ]
      : []),
    ...(iban
      ? [{ label: "IBAN", value: iban, mono: true, copyable: true, testId: "sepa-iban" }]
      : []),
    ...(bic ? [{ label: "BIC / Swift", value: bic, mono: true, copyable: true }] : []),
    { label: "Bedrag", value: money, mono: true, testId: "sepa-amount" },
    { label: "Referentie", value: reference, mono: true, copyable: true, testId: "sepa-reference" },
  ];

  const localQr = buildLocalPaymentQr({
    beneficiary,
    currency,
    amountCents,
    reference,
    iban,
    bic,
    routingNumber: bank?.routingNumber ?? null,
    sortCode: bank?.sortCode ?? null,
    accountNumber: bank?.accountNumber ?? null,
    pixKey: bank?.pixKey ?? null,
    pixCity: bank?.pixCity ?? null,
    upiVpa: bank?.upiVpa ?? null,
  });

  const copy = (value: string, what: string) => {
    void navigator.clipboard.writeText(value.replace(/\s+/g, " ").trim());
    notifySuccess(`Gekopieerd · ${what}`);
  };

  const copyAll = () => {
    void navigator.clipboard.writeText(rows.map((r) => `${r.label}: ${r.value}`).join("\n"));
    setCopied(true);
    notifySuccess("Bankgegevens, bedrag en referentie gekopieerd");
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted p-3 text-[11px]">
      {/* Status indicator — flips to “Verified” the moment the badge lands. */}
      <div
        role="status"
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          status === "paid"
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-background text-muted-foreground"
        }`}
      >
        {status === "paid" ? (
          <>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Geverifieerd
          </>
        ) : (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Betaling in behandeling
          </>
        )}
      </div>

      <TransferLifecycle
        stage={
          status === "paid"
            ? "completed"
            : bankState === "unavailable"
              ? "failed"
              : status === "processing"
                ? "pending"
                : "created"
        }
        note={
          status === "paid"
            ? "Overschrijving ontvangen en gekoppeld aan je referentie."
            : bankState === "unavailable"
              ? "We konden voor deze valuta geen overschrijving klaarzetten."
              : "We volgen je overschrijving live via onze bankkoppeling."
        }
      />

      {bankState === "loading" && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Bankgegevens voor jouw land
          ophalen…
        </p>
      )}

      {bankState === "bunqme" && bunqmeUrl ? (
        /* Beveiligd betaalverzoek in de lokale valuta. */
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-4">
          <p className="text-center leading-relaxed text-muted-foreground">
            Beveiligd betaalverzoek in {countryCurrency} — bedrag en referentie zijn al ingevuld.
          </p>
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={bunqmeUrl} size={168} level="M" marginSize={0} />
          </div>
          <Button
            type="button"
            className="h-11 w-full rounded-xl text-sm font-semibold"
            onClick={() => window.open(bunqmeUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            Betaal {money} via bunq
          </Button>
        </div>
      ) : bankState === "unavailable" ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Overschrijven in {countryCurrency} kan momenteel niet bij onze bank. Kies je eigen valuta
          bij het afrekenen, betaal met kaart, of gebruik de lokale standaard van je land (Pix in
          Brazilië, UPI in India) wanneer die verschijnt.
        </p>
      ) : bankState === "loading" ? null : (
        <>
          {status !== "paid" && (
            <p className="rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Betaling in behandeling — zodra de overschrijving met referentie{" "}
              <span className="font-mono font-semibold text-foreground">{reference}</span> op onze
              rekening binnenkomt, herkent ons systeem die referentie automatisch, wordt je account
              direct geactiveerd en ontvang je een bevestiging per e-mail (in jouw taal). Je hoeft
              hier niets meer voor te doen.
            </p>
          )}

          {currency === "EUR" ? (
            <p className="rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Je betaalt op een Europese SEPA-rekening, volledig conform de Europese SEPA-wetgeving.
              Elke betaler binnen de SEPA-zone kan dus overschrijven zonder extra kosten of
              buitenlandtoeslag — in euro, met de gewone binnenlandse tarieven van je bank.
            </p>
          ) : (
            <p className="rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Je betaalt op een lokale {currency}-rekening, dus je overschrijving blijft binnenlands
              — geen valutakosten of buitenlandtoeslag.
            </p>
          )}

          {/* Desktop: scan-first — EPC voor SEPA, lokale instructie daarbuiten. */}
          {localQr && (
            <div className="hidden flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 sm:flex">
              <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-foreground">
                {currency === "EUR" ? "SEPA Bank-QR (EPC)" : `Bank-QR · ${currency}`}
              </p>
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={localQr.payload} size={168} level="M" marginSize={0} />
              </div>
              <p className="text-center text-[11px] font-medium text-foreground">
                Uitsluitend te scannen ín je bank-app (KBC, Belfius, ING, Argenta, Wise, bunq …) —
                niet met de standaard telefooncamera.
              </p>
              <p className="text-center text-[10px] text-muted-foreground">
                {localQr.standard} · {money} · {reference} — {localQr.hint}
              </p>
            </div>
          )}

          {/* Eén strak, kopieerbaar vak met alle bankgegevens. */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <dl className="divide-y divide-border/60">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`truncate font-semibold ${row.mono ? "font-mono tabular-nums" : ""}`}
                      {...(row.testId ? { "data-testid": row.testId } : {})}
                    >
                      {row.value}
                    </span>
                    {row.copyable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 rounded-lg px-2"
                        onClick={() => copy(row.value, row.label)}
                      >
                        <Copy className="h-3 w-3" />
                        <span className="sr-only">{row.label} kopiëren</span>
                      </Button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <Button
              type="button"
              className="h-11 w-full rounded-xl text-sm font-semibold"
              onClick={copyAll}
            >
              {copied ? (
                <Check className="mr-2 h-4 w-4" aria-hidden />
              ) : (
                <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden />
              )}
              {copied ? "Gekopieerd" : "Alle betaalgegevens kopiëren"}
            </Button>
          </div>

          <p className="text-muted-foreground">
            Gebruik de referentie exact zoals hierboven — daarmee koppelen we jouw overschrijving.
            Klopt het bedrag maar ontbreekt de referentie, dan mailen we je een kort formulier.
            Overschrijvingen worden automatisch verwerkt; de verificatie gaat doorgaans 1–2
            werkdagen na ontvangst live.
          </p>
        </>
      )}
    </div>
  );
}
