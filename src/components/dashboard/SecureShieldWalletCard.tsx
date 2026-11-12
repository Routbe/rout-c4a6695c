import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { getWallet, startWalletTopupCheckout, updateWalletAutoTopup } from "@/lib/wallet.functions";
import { WALLET_TOPUP_TIERS_CENTS, type WalletTopupCents } from "@/lib/wallet-tiers";
import { i18n as trI18n } from "@/lib/i18n";

type WalletData = Awaited<ReturnType<typeof getWallet>>;

const TOPUPS = WALLET_TOPUP_TIERS_CENTS;

function euro(cents: number): string {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** SecureShield™ prepaid tegoed: saldo, opwaarderen en automatische bijvulling. */
export function SecureShieldWalletCard() {
  const { user } = useAuth();
  const loadWallet = useServerFn(getWallet);
  const startTopup = useServerFn(startWalletTopupCheckout);
  const saveAutoTopup = useServerFn(updateWalletAutoTopup);

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadWallet();
        if (!cancelled) setWallet(data);
      } catch {
        /* saldo blijft verborgen tot de volgende poging */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadWallet]);

  if (!user) return null;

  async function topup(amountCents: WalletTopupCents) {
    setBusy(true);
    try {
      const result = await startTopup({
        data: { amountCents, origin: window.location.origin },
      });
      if (result.ok) window.location.href = result.url;
      else if (result.reason === "parent_approval_sent") toast.success(trI18n.t("ui.4d824ba002"), { description: "Je ouder krijgt een betaallink die 48 uur geldig is." });
      else toast.error(trI18n.t("ui.3742bfc849"), { description: result.reason });
    } catch {
      toast.error(trI18n.t("ui.3742bfc849"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAuto(enabled: boolean) {
    if (!wallet) return;
    setBusy(true);
    try {
      const next = await saveAutoTopup({
        data: { enabled, amountCents: wallet.autoTopupCents },
      });
      setWallet(next);
    } catch {
      toast.error(trI18n.t("ui.16d7d7726c"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            SecureShield™ Relay
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Je prepaid tegoed dekt de relaykost van {euro(9)} per maand. Zonder saldo pauzeert de
            mailrelay automatisch.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saldo laden…
        </div>
      ) : !wallet ? (
        <p className="text-xs text-muted-foreground">Saldo is nu niet beschikbaar.</p>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Beschikbaar tegoed
            </p>
            <p className="mt-1 font-mono text-2xl">{euro(wallet.balanceCents)}</p>
            {wallet.lowBalance && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Laag saldo — waardeer op om je relay actief te houden.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="input-label">Tegoed opwaarderen</p>
            <div className="flex flex-wrap gap-2">
              {TOPUPS.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void topup(amount)}
                  className="rounded-full font-mono"
                >
                  {euro(amount)}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Kies €10, €25, €50, €100 of €250.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-3.5 w-3.5" /> Automatisch bijvullen
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Vul automatisch {euro(wallet.autoTopupCents)} bij zodra je saldo laag is.
              </p>
            </div>
            <Switch
              aria-label="Automatisch bijvullen"
              disabled={busy}
              checked={wallet.autoTopup}
              onCheckedChange={(v) => void toggleAuto(v)}
            />
          </div>

          {wallet.transactions.length > 0 && (
            <ul className="space-y-1.5 border-t border-border pt-3">
              {wallet.transactions.slice(0, 5).map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">
                    {tx.description ?? tx.kind}
                  </span>
                  <span className="shrink-0 font-mono">
                    {tx.amountCents >= 0 ? "+" : "−"}
                    {euro(Math.abs(tx.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
