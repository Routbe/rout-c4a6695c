import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Loader2, MessageSquareText, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RecoveryCodes } from "@/components/settings/RecoveryCodes";
import { PhoneVerification } from "@/components/settings/PhoneVerification";
import { authClient } from "@/lib/auth-client";
import { getPhoneStatus } from "@/lib/phone/phone.functions";

/**
 * Switches 2FA on for the signed-in member: authenticator app (QR + recovery
 * codes) or SMS to a verified phone number. E-mail is never offered.
 */
export function TwoFactorSetup({ onEnabled }: { onEnabled: () => void }) {
  const { t } = useTranslation();
  const fetchPhone = useServerFn(getPhoneStatus);
  const phone = useQuery({ queryKey: ["phone-status"], queryFn: () => fetchPhone() });
  const [method, setMethod] = useState<"app" | "sms">("app");
  const [uri, setUri] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const done = () => {
    toast.success(t("auth.mf.setupDone"));
    onEnabled();
  };

  const startApp = async () => {
    setBusy(true);
    try {
      const res = await authClient.twoFactor.enable({} as never);
      const data = res.data as { totpURI?: string; backupCodes?: string[] } | null;
      if (res.error || !data?.totpURI) {
        toast.error(res.error?.message || t("auth.mf.setupFailed"));
        return;
      }
      setUri(data.totpURI);
      setBackup(data.backupCodes ?? []);
    } finally {
      setBusy(false);
    }
  };

  const confirmApp = async () => {
    setBusy(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code });
      if (res.error) toast.error(res.error.message || t("auth.ui.code.invalid"));
      else done();
    } finally {
      setBusy(false);
    }
  };

  const sendSms = async () => {
    setBusy(true);
    try {
      const res = await authClient.twoFactor.sendOtp({} as never);
      if (res.error) toast.error(res.error.message || t("auth.mf.setupFailed"));
      else setSmsSent(true);
    } finally {
      setBusy(false);
    }
  };

  const confirmSms = async () => {
    setBusy(true);
    try {
      const res = await authClient.twoFactor.verifyOtp({ code });
      if (res.error) toast.error(res.error.message || t("auth.ui.code.invalid"));
      else done();
    } finally {
      setBusy(false);
    }
  };

  const codeInput = (
    <input
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label={t("auth.ui.code.label")}
      className="h-11 w-full rounded-xl border border-input bg-background text-center font-mono tracking-[0.3em] text-foreground"
    />
  );

  const smsReady = phone.data?.configured && phone.data.verified;

  return (
    <div className="space-y-4" data-testid="two-factor-setup">
      <div role="tablist" aria-label={t("auth.mf.setupTitle")} className="grid grid-cols-2 gap-1 rounded-xl border border-border p-1">
        {([["app", Smartphone, t("auth.mf.setupApp")], ["sms", MessageSquareText, t("auth.mf.setupSms")]] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={method === id}
            onClick={() => { setMethod(id); setCode(""); }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm transition-colors ${method === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {method === "app" && (
        !uri ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("auth.mf.setupAppHint")}</p>
            <Button type="button" onClick={() => void startApp()} disabled={busy} className="h-11 w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.mf.setupStart")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">{t("auth.mf.setupScan")}</p>
            <div className="rounded-xl border border-border bg-background p-3">
              <QRCodeSVG value={uri} size={176} />
            </div>
            <p className="break-all text-center font-mono text-[11px] text-muted-foreground">{new URL(uri).searchParams.get("secret")}</p>
            {backup.length > 0 && <RecoveryCodes codes={backup} onSaved={setSaved} />}
            {codeInput}
            <Button type="button" onClick={() => void confirmApp()} disabled={busy || code.length !== 6 || (backup.length > 0 && !saved)} className="h-11 w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.mf.setupConfirm")}
            </Button>
          </div>
        )
      )}

      {method === "sms" && (
        phone.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !phone.data?.configured ? (
          <p className="text-sm text-muted-foreground">{t("auth.mf.setupSmsUnavailable")}</p>
        ) : !smsReady ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("auth.mf.setupSmsNeedPhone")}</p>
            <PhoneVerification />
          </div>
        ) : !smsSent ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("auth.mf.setupSmsHint")}</p>
            <Button type="button" onClick={() => void sendSms()} disabled={busy} className="h-11 w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.mf.setupSendSms", { to: phone.data.masked ?? "" })}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("auth.mf.secondSmsSent", { to: phone.data.masked ?? "" })}</p>
            {codeInput}
            <Button type="button" onClick={() => void confirmSms()} disabled={busy || code.length !== 6} className="h-11 w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.mf.setupConfirm")}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
