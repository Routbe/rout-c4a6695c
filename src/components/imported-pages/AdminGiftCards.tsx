import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Printer, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { euro } from "@/lib/gift-cards";
import { listGiftShipments, setGiftShipmentStatus } from "@/lib/admin-gift-cards.functions";
import { AppLayout } from "@/components/layout/AppLayout";
import type { GiftShipmentRow } from "@/lib/admin-gift-cards.server";
import { IssuePersonalGift } from "@/components/admin/IssuePersonalGift";
import { i18n as trI18n } from "@/lib/i18n";

const STEP_LABEL: Record<string, string> = {
  pending_print: "Te drukken",
  packaged: "Ingepakt",
  shipped: "Verzonden",
  not_applicable: "Digitaal",
};

/** /admin/gift-cards — verzendwachtrij voor fysieke bonnen (gratis in België). */
export default function AdminGiftCards() {
  const list = useServerFn(listGiftShipments);
  const update = useServerFn(setGiftShipmentStatus);
  const [rows, setRows] = useState<GiftShipmentRow[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await list({ data: { openOnly } })) as GiftShipmentRow[]);
    } catch {
      toast.error(trI18n.t("ui.4ca3b90a07"));
    } finally {
      setLoading(false);
    }
  }, [list, openOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = async (
    row: GiftShipmentRow,
    status: "pending_print" | "packaged" | "shipped",
  ) => {
    setBusy(row.id);
    try {
      const result = await update({
        data: { giftId: row.id, status, trackingCode: tracking[row.id] ?? "" },
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await load();
    } catch {
      toast.error(trI18n.t("ui.9affdfbecf"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppLayout title="Cadeaubonnen" crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Cadeaubonnen" }]}>
    <div className="space-y-4">
      <IssuePersonalGift />
      <header className="space-y-1 pt-4">
        <h2 className="text-lg font-medium text-foreground">Verzending van fysieke bonnen</h2>
        <p className="text-sm text-muted-foreground">
          Fysieke bonnen worden gratis binnen België verstuurd. Doorloop de stappen: te drukken →
          ingepakt → verzonden.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch id="open-only" checked={openOnly} onCheckedChange={setOpenOnly} />
          <Label htmlFor="open-only" className="text-xs text-muted-foreground">
            Enkel openstaande zendingen
          </Label>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden
          />
          Vernieuwen
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Labels afdrukken
        </Button>
      </div>

      {rows.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Geen fysieke bonnen in de wachtrij.
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-sm text-foreground">{row.code}</p>
                <p className="text-xs text-muted-foreground">
                  {euro(row.amount_cents)} · {row.design} · besteld{" "}
                  {new Date(row.created_at).toLocaleDateString("nl-BE")}
                </p>
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {STEP_LABEL[row.fulfilment_status] ?? row.fulfilment_status}
              </span>
            </div>

            <address className="not-italic rounded-xl border border-border/60 bg-background p-3 text-xs text-muted-foreground">
              <span className="block text-foreground">
                {row.ship_name ?? row.recipient_name ?? "—"}
              </span>
              {row.ship_line1}
              <br />
              {row.ship_postal_code} {row.ship_city}
              <br />
              {row.ship_country ?? "BE"}
              <br />
              <span className="opacity-70">Koper: {row.purchaser_email}</span>
            </address>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-48 rounded-xl"
                placeholder="Trackingcode (optioneel)"
                value={tracking[row.id] ?? row.tracking_code ?? ""}
                onChange={(event) =>
                  setTracking((prev) => ({ ...prev, [row.id]: event.target.value }))
                }
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy === row.id}
                onClick={() => void advance(row, "packaged")}
              >
                <Package className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Ingepakt
              </Button>
              <Button
                size="sm"
                disabled={busy === row.id}
                onClick={() => void advance(row, "shipped")}
              >
                <Truck className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Markeer als verzonden
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
    </AppLayout>
  );
}

