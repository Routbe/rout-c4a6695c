import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { EyeOff, KeyRound, Loader2, QrCode, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { createVaultPass, getMyWalletVault } from "@/lib/wallet/wallet.functions";
import type { WalletPassType } from "@/lib/wallet/wallet-key";

type Vault = Awaited<ReturnType<typeof getMyWalletVault>>;
type Busy = `${WalletPassType}:${"google" | "apple"}` | null;

/**
 * The 3-card vault: public profile card, private alias card and the Sovereign Key
 * are exported as three separate passes, so a QR card never carries an NFC token
 * and the NFC key never shows a QR or any profile data.
 */
export type VaultKind = "public" | "stealth" | "key";

export function WalletVault({ only }: { /** Show just these passes (the wallet page splits ROUT card and profile cards). */ only?: VaultKind[] } = {}) {
  const show = (k: VaultKind) => !only || only.includes(k);
  const { t } = useTranslation();
  const load = useServerFn(getMyWalletVault);
  const issue = useServerFn(createVaultPass);
  const [vault, setVault] = useState<Vault | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  useEffect(() => {
    let live = true;
    load().then((v) => { if (live) setVault(v); }).catch(() => { if (live) setVault(null); });
    return () => { live = false; };
  }, [load]);

  const addGoogle = async (passType: WalletPassType) => {
    setBusy(`${passType}:google`);
    const tab = window.open("", "_blank");
    try {
      const r = await issue({ data: { passType } });
      if (!r.ok) throw new Error(r.error);
      if (tab) tab.location.href = r.saveUrl;
      else window.location.href = r.saveUrl;
    } catch {
      tab?.close();
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(null);
    }
  };

  const addApple = async (passType: WalletPassType, href: string, filename: string) => {
    setBusy(`${passType}:apple`);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(null);
    }
  };

  const keys = (type: WalletPassType, google: boolean, apple: { ok: boolean; href: string; file: string }) => (
    <div className="wallet-vault-keys">
      <button type="button" className="wallet-vault-key" disabled={!google || busy !== null} onClick={() => void addGoogle(type)}>
        {busy === `${type}:google` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t("wallet.google")}
      </button>
      <button type="button" className="wallet-vault-key" disabled={!apple.ok || busy !== null} onClick={() => void addApple(type, apple.href, apple.file)}>
        {busy === `${type}:apple` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t("wallet.apple")}
      </button>
    </div>
  );

  const v = vault;
  const root = v?.root ?? null;
  const alias = v?.alias ?? null;
  const keyReady = !!v && (v.keyGoogle || v.keyApple);

  return (
    <section className="wallet-vault" aria-labelledby="wallet-vault-title">
      <header className="space-y-1">
        <h3 id="wallet-vault-title" className="text-sm font-semibold">{t("vault.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("vault.lead")}</p>
      </header>
      {v && !v.verified && <p className="wallet-vault-warning"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {t("vault.unverified")}</p>}

      {show("public") && <VaultCard kind="public" icon={<QrCode className="h-5 w-5" aria-hidden />} title={t("vault.public.title")} tag={t("vault.public.tag")} body={t("vault.public.body")}>
        {keys("PUBLIC_PROFILE", !!v?.google && !!root, { ok: !!v?.apple && !!root, href: `/api/wallet/profile/${encodeURIComponent(root ?? "")}?type=apple&space=root`, file: `rout-${root}.pkpass` })}
        {v && !v.google && !v.apple && <p className="wallet-vault-note">{t("vault.offline")}</p>}
      </VaultCard>}

      {show("stealth") && <VaultCard kind="stealth" icon={<EyeOff className="h-5 w-5" aria-hidden />} title={t("vault.stealth.title")} tag={t("vault.stealth.tag")} body={t("vault.stealth.body")}>
        {keys("STEALTH", !!v?.google && !!alias, { ok: !!v?.apple && !!alias, href: `/api/wallet/profile/${encodeURIComponent(alias ?? "")}?type=apple&space=alias`, file: `rout-u-${alias}.pkpass` })}
        {v && !alias && <p className="wallet-vault-note">{t("vault.stealth.none")}</p>}
      </VaultCard>}

      {show("key") && <VaultCard kind="key" icon={<KeyRound className="h-5 w-5" aria-hidden />} title={t("vault.key.title")} tag={t("vault.key.tag")} body={t("vault.key.body")}>
        <p className="wallet-vault-warning"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {t("vault.key.warning")}</p>
        {keys("SMART_TAP_KEY", !!v?.keyGoogle, { ok: !!v?.keyApple, href: "/api/wallet/key", file: "rout-sovereign-key.pkpass" })}
        {v && !keyReady && <p className="wallet-vault-note">{t("vault.key.pending")}</p>}
      </VaultCard>}
    </section>
  );
}

function VaultCard({ kind, icon, title, tag, body, children }: { kind: "public" | "stealth" | "key"; icon: ReactNode; title: string; tag: string; body: string; children: ReactNode }) {
  return (
    <article className="wallet-vault-card" data-kind={kind}>
      <div className="flex items-start gap-3">
        <span className="wallet-vault-icon">{icon}</span>
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-semibold leading-tight">{title}</h4>
          <p className="wallet-vault-tag">{tag}</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed opacity-80">{body}</p>
      {children}
    </article>
  );
}
