import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Fingerprint, KeyRound, Loader2, MessageSquareText, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { authClient } from "@/lib/auth-client";
import type { SecondFactorMethod } from "@/lib/auth/sign-in-policy";

type Options = { pending: boolean; methods: SecondFactorMethod[]; smsTo: string | null };
type Code = Exclude<SecondFactorMethod, "passkey">;

/**
 * Second sign-in step after a password or e-mail link, for members with 2FA on:
 * passkey, authenticator app, SMS code or a one-time recovery code.
 */
export function SecondFactorStep({ allowTrust, onDone, onRestart }: { allowTrust: boolean; onDone: () => Promise<void> | void; onRestart: () => void }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Options | null>(null);
  const [failed, setFailed] = useState(false);
  const [method, setMethod] = useState<Code | null>(null);
  const [code, setCode] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/two-factor/options", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<Options>) : Promise.reject(new Error(String(r.status)))))
      .then((o) => {
        setOptions(o);
        setMethod((o.methods.find((m) => m !== "passkey") as Code | undefined) ?? null);
      })
      .catch(() => setFailed(true));
  }, []);

  const finish = async (res: { error?: { message?: string; status?: number } | null } | undefined) => {
    if (res?.error) {
      toast.error(res.error.status === 401 && /cookie/i.test(res.error.message ?? "") ? t("auth.mf.secondExpired") : res.error.message || t("auth.ui.code.invalid"));
      return;
    }
    toast.success(t("auth.ui.toast.welcome"));
    await onDone();
  };

  const withPasskey = async () => {
    setBusy(true);
    try {
      await finish(await authClient.signIn.passkey());
    } catch {
      toast.error(t("auth.passkey.failed"));
    } finally {
      setBusy(false);
    }
  };

  const sendSms = async () => {
    setBusy(true);
    try {
      const res = await authClient.twoFactor.sendOtp({ trustDevice: allowTrust && trust } as never);
      if (res.error) toast.error(res.error.message || t("auth.mf.secondExpired"));
      else setSmsSent(true);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method) return;
    setBusy(true);
    try {
      const trustDevice = allowTrust && trust;
      const clean = method === "backup" ? code.trim() : code.replace(/\D/g, "");
      const res =
        method === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: clean, trustDevice })
          : method === "sms"
            ? await authClient.twoFactor.verifyOtp({ code: clean, trustDevice })
            : await authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice });
      await finish(res as never);
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("auth.mf.secondExpired")}</p>
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onRestart}>{t("auth.mf.backToSignIn")}</Button>
      </div>
    );
  }
  if (!options) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("auth.mf.secondTitle")} /></div>;

  const codeMethods = options.methods.filter((m): m is Code => m !== "passkey");
  const label: Record<Code, string> = { totp: t("auth.mf.secondApp"), sms: t("auth.mf.secondSms"), backup: t("auth.mf.secondBackup") };
  const icon: Record<Code, typeof KeyRound> = { totp: Smartphone, sms: MessageSquareText, backup: KeyRound };

  return (
    <div className="space-y-4" data-testid="second-factor-step">
      <div>
        <h2 className="font-display text-lg text-foreground">{t("auth.mf.secondTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.mf.secondBody")}</p>
      </div>

      {options.methods.includes("passkey") && (
        <Button type="button" onClick={() => void withPasskey()} disabled={busy} className="h-11 w-full gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />} {t("auth.mf.secondPasskey")}
        </Button>
      )}

      {codeMethods.length > 1 && (
        <div role="tablist" aria-label={t("auth.mf.secondTitle")} className="grid gap-1 rounded-xl border border-border p-1" style={{ gridTemplateColumns: `repeat(${codeMethods.length}, minmax(0, 1fr))` }}>
          {codeMethods.map((m) => {
            const Icon = icon[m];
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => { setMethod(m); setCode(""); }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition-colors ${method === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label[m]}
              </button>
            );
          })}
        </div>
      )}

      {method && (
        <form onSubmit={submit} className="space-y-3">
          {method === "sms" && !smsSent ? (
            <Button type="button" variant="outline" onClick={() => void sendSms()} disabled={busy} className="h-11 w-full gap-2">
              <MessageSquareText className="h-4 w-4" /> {t("auth.mf.secondSmsSend", { to: options.smsTo ?? "" })}
            </Button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {method === "totp" ? t("auth.totp") : method === "sms" ? t("auth.mf.secondSmsSent", { to: options.smsTo ?? "" }) : t("auth.mf.secondBackupHint")}
              </p>
              <input
                value={code}
                onChange={(e) => setCode(method === "backup" ? e.target.value.slice(0, 32) : e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode={method === "backup" ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                aria-label={label[method]}
                className="h-11 w-full rounded-xl border border-input bg-background text-center font-mono tracking-[0.3em] text-foreground"
              />
              {allowTrust && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={trust} onCheckedChange={(v) => setTrust(v === true)} /> {t("auth.mf.trustDevice")}
                </label>
              )}
              <Button type="submit" disabled={busy || (method === "backup" ? code.trim().length < 6 : code.length !== 6)} className="h-11 w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.confirm")}
              </Button>
            </>
          )}
        </form>
      )}

      {options.methods.length === 0 && <p className="text-sm text-muted-foreground">{t("auth.mf.secondNone")}</p>}

      <button type="button" onClick={onRestart} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {t("auth.mf.backToSignIn")}
      </button>
    </div>
  );
}
