import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, KeyRound, LifeBuoy, LockKeyhole, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeStepUp, getStepUpOptions, sendStepUpEmail, sendStepUpSms } from "@/lib/auth/step-up.functions";
import { isStepUpRequiredError, type StepUpMethod } from "@/lib/auth/step-up-rules";
import { authClient } from "@/lib/auth-client";
import { i18n, useTranslation } from "@/lib/i18n";

/** ROUT card actions accept every active factor (SMS, recovery code, password too); a scan only a real second factor. */
export type StepUpScope = "card_reveal" | "card_lifecycle" | "card_scan";
type Waiter = { resolve: (ok: boolean) => void; action?: StepUpScope };
let opener: ((w: Waiter) => void) | null = null;

/** Opens the step-up dialog; resolves true once verified. */
export function requestStepUp(action?: StepUpScope): Promise<boolean> {
  return new Promise((resolve) => (opener ? opener({ resolve, action }) : resolve(false)));
}

/** Runs fn; on a 401 Step-Up Required asks for verification once and retries. */
export async function withStepUp<T>(fn: () => Promise<T>, action?: StepUpScope): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isStepUpRequiredError(e)) throw e;
    if (!(await requestStepUp(action))) throw new Error(i18n.t("stepUp.cancelled"));
    return fn();
  }
}

export function StepUpDialog() {
  const { t } = useTranslation();
  const [waiter, setWaiter] = useState<Waiter | null>(null);
  const [methods, setMethods] = useState<StepUpMethod[]>([]);
  const [method, setMethod] = useState<StepUpMethod | null>(null);
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useServerFn(getStepUpOptions);
  const complete = useServerFn(completeStepUp);
  const sendEmail = useServerFn(sendStepUpEmail);
  const sendSms = useServerFn(sendStepUpSms);

  useEffect(() => {
    opener = (w) => {
      setWaiter(w);
      setCode("");
      setSecret("");
      setSent(false);
      setError(null);
      setLoaded(false);
      setMethods([]);
      void options({ data: w.action ? { action: w.action } : undefined }).then((r) => {
        setMethods(r.methods);
        setMethod(r.methods[0] ?? null);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    };
    return () => {
      opener = null;
    };
  }, [options]);

  const close = (ok: boolean) => {
    waiter?.resolve(ok);
    setWaiter(null);
  };

  async function verify() {
    if (!method) return;
    setBusy(true);
    setError(null);
    try {
      const action = waiter?.action;
      if (method === "passkey") {
        const r = await authClient.signIn.passkey();
        if (r?.error) throw new Error(t("stepUp.passkeyFailed"));
        await complete({ data: { method, ...(action ? { action } : {}) } });
      } else if (method === "backup") {
        await complete({ data: { method, backupCode: secret.trim(), ...(action ? { action } : {}) } });
      } else if (method === "password") {
        await complete({ data: { method, password: secret, ...(action ? { action } : {}) } });
      } else {
        await complete({ data: { method, code, ...(action ? { action } : {}) } });
      }
      close(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ui.failed"));
    } finally {
      setBusy(false);
    }
  }

  const label: Record<StepUpMethod, string> = { passkey: t("stepUp.passkey"), totp: t("stepUp.totp"), email: t("stepUp.email"), sms: t("stepUp.sms"), backup: t("stepUp.backup"), password: t("stepUp.password") };
  const icon = { passkey: Fingerprint, totp: KeyRound, email: Mail, sms: MessageSquare, backup: LifeBuoy, password: LockKeyhole };
  const codeMethod = method === "totp" || ((method === "email" || method === "sms") && sent);
  const ready = method === "passkey" || (codeMethod && code.length === 6) || ((method === "backup" || method === "password") && secret.trim().length >= (method === "backup" ? 6 : 1));

  return (
    <Dialog open={!!waiter} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> {t("stepUp.title")}
          </DialogTitle>
          <DialogDescription>{waiter?.action ? t("stepUp.cardDescription") : t("stepUp.description")}</DialogDescription>
        </DialogHeader>
        {loaded && waiter?.action && methods.length === 0 && (
          <p role="alert" className="rounded-md border border-border bg-muted p-2 text-sm">{t("stepUp.needTwoFactor")}</p>
        )}
        {methods.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => {
              const I = icon[m];
              return (
                <Button key={m} size="sm" variant={m === method ? "default" : "outline"} onClick={() => { setMethod(m); setCode(""); setSecret(""); setSent(false); setError(null); }} className="gap-1.5" aria-pressed={m === method}>
                  <I className="h-4 w-4" /> {label[m]}
                </Button>
              );
            })}
          </div>
        )}
        {method === "email" && (
          <p className="rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">
            {t("stepUp.emailHint")}
          </p>
        )}
        {method === "email" && !sent && (
          <Button variant="outline" disabled={busy} onClick={() => void sendEmail().then(() => setSent(true)).catch((e: Error) => setError(e.message))}>
            {t("stepUp.send")}
          </Button>
        )}
        {method === "sms" && !sent && (
          <Button variant="outline" disabled={busy} onClick={() => void sendSms().then(() => setSent(true)).catch((e: Error) => setError(e.message))}>
            {t("stepUp.sendSms")}
          </Button>
        )}
        {codeMethod && (
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} aria-label={label[method!]}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        )}
        {method === "backup" && (
          <Input autoComplete="off" spellCheck={false} maxLength={40} placeholder="xxxxx-xxxxx" value={secret} aria-label={label.backup}
            className="font-mono" onChange={(e) => setSecret(e.target.value)} />
        )}
        {method === "password" && (
          <Input type="password" autoComplete="current-password" maxLength={256} value={secret} aria-label={label.password}
            onChange={(e) => setSecret(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready) void verify(); }} />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(false)}>{t("ui.cancel")}</Button>
          <Button disabled={busy || !method || !ready} onClick={() => void verify()}>
            {method === "passkey" ? t("stepUp.usePasskey") : t("stepUp.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
