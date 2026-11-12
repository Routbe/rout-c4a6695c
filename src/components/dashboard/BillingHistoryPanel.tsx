import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { euro } from "@/lib/profile";
import { downloadMyInvoice, listMyInvoices } from "@/lib/billing.functions";
import { i18n as trI18n } from "@/lib/i18n";

interface Invoice {
  paymentId: string;
  invoiceNumber: string;
  tier: string;
  provider: string;
  amountCents: number;
  currency: string;
  paidAt: string;
  reference: string;
}

/** Zet base64 om naar een download zonder de PDF ooit op de server te bewaren. */
function saveBase64Pdf(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  // Firefox/Safari negeren een klik op een anker dat niet in het document staat,
  // en het intrekken van de blob-URL mag pas nadat de download is gestart.
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

/** Betaalgeschiedenis met herdownload van elke eerder verstuurde factuur. */
export function BillingHistoryPanel() {
  const { user } = useAuth();
  const load = useServerFn(listMyInvoices);
  const download = useServerFn(downloadMyInvoice);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = (await load()) as { invoices: Invoice[] };
      setInvoices(res.invoices ?? []);
    } catch {
      toast.error(trI18n.t("ui.870946db35"));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  if (!user || loading || invoices.length === 0) return null;

  const onDownload = async (paymentId: string) => {
    setBusyId(paymentId);
    try {
      const res = await download({ data: { paymentId } });
      if (!res.ok || !res.base64) {
        toast.error(trI18n.t("ui.f839c02e19"));
        return;
      }
      saveBase64Pdf(res.filename, res.base64);
    } catch (err) {
      console.error("[facturen] download mislukt", err);
      toast.error(trI18n.t("ui.8f7ecbfbb9"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Facturen &amp; betalingen</h2>
      </header>

      <ul className="divide-y divide-border">
        {invoices.map((invoice) => (
          <li key={invoice.paymentId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{invoice.invoiceNumber}</p>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(invoice.paidAt).toLocaleDateString()} · {invoice.provider} ·{" "}
                {euro(invoice.amountCents)}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              disabled={busyId === invoice.paymentId}
              onClick={() => void onDownload(invoice.paymentId)}
            >
              {busyId === invoice.paymentId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Factuur downloaden (PDF)
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
