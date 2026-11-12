import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Fingerprint, Loader2 } from "lucide-react";
import { verifySecureCardToken } from "@/lib/wallet/wallet.functions";
import { requestStepUp } from "@/components/auth/StepUpDialog";

export const Route = createFileRoute("/kaart/$token")({
  head: () => ({
    meta: [
      { title: "ROUT-kaart controleren · ROUT" },
      { name: "description", content: "Controleer een ROUT-kaart. Eerst bevestig je met je passkey of tweestapsverificatie; pas daarna wordt iets getoond." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { property: "og:title", content: "ROUT-kaart controleren" },
      { property: "og:description", content: "Verificatie vereist: een scan toont nooit meteen gegevens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanReceiver,
});

type Result = Awaited<ReturnType<typeof verifySecureCardToken>>;

/**
 * Zero-trust scan receiver. A scanned QR is public: this page shows nothing and
 * checks nothing until the scanner is signed in and confirms with a passkey,
 * authenticator app or SMS. Only then is the code checked (once, single-use).
 */
function ScanReceiver() {
  const { token } = Route.useParams();
  const { t } = useTranslation();
  const verify = useServerFn(verifySecureCardToken);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);

  async function start() {
    setBusy(true);
    try {
      let res = await verify({ data: { token } });
      if (res.status === "step_up_required") {
        if (!(await requestStepUp("card_scan"))) { setR(res); return; }
        res = await verify({ data: { token } });
      }
      setR(res);
    } catch {
      setR({ status: "invalid" });
    } finally {
      setBusy(false);
    }
  }

  const next = typeof window === "undefined" ? "" : window.location.pathname;
  const line = (prompt: string, tone: "ok" | "alert", title: string, text: string) => (
    <>
      <p className="zt-prompt text-xs" data-tone={tone}>// {prompt}</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="zt-muted text-sm leading-relaxed">{text}</p>
    </>
  );

  return (
    <main className="zt-surface flex items-center justify-center p-6">
      <section className="zt-panel w-full max-w-md space-y-4 p-6" aria-live="polite">
        {!r || r.status === "step_up_required" ? (
          <>
            {line(t("cardScan.pVerify"), "ok", t("cardScan.verifyTitle"), t("cardScan.verifyText"))}
            {r?.status === "step_up_required" && <p className="zt-prompt text-xs" data-tone="alert">// {t("cardScan.cancelled")}</p>}
            <button type="button" className="zt-button w-full" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Fingerprint className="h-4 w-4" aria-hidden />}
              {t("cardScan.confirm")}
            </button>
          </>
        ) : r.status === "sign_in_required" ? (
          <>
            {line(t("cardScan.pSignIn"), "alert", t("cardScan.signInTitle"), t("cardScan.signInText"))}
            <a className="zt-button w-full" href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>{t("cardScan.signIn")}</a>
          </>
        ) : r.status === "two_factor_required" ? (
          <>
            {line(t("cardScan.p2fa"), "alert", t("cardScan.twoFaTitle"), t("cardScan.twoFaText"))}
            <Link className="zt-button w-full" to="/studio/account">{t("cardScan.toSecurity")}</Link>
          </>
        ) : r.status === "valid" ? (
          <>
            {line(t("cardScan.pValid"), "ok", t("cardScan.validTitle"), t("cardScan.validText"))}
            <div className="zt-panel flex items-center gap-3 p-4">
              {r.avatar_url && <img src={r.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />}
              <p className="text-lg font-semibold">{r.display_name}</p>
            </div>
          </>
        ) : r.status === "expired" || r.status === "replayed" ? (
          line(r.status === "replayed" ? t("cardScan.pUsed") : t("cardScan.pExpired"), "alert", r.status === "replayed" ? t("cardScan.usedTitle") : t("cardScan.expiredTitle"), t("cardScan.expiredText"))
        ) : r.status === "frozen" ? (
          line(t("cardScan.pBlocked"), "alert", t("cardScan.frozenTitle"), t("cardScan.frozenText"))
        ) : r.status === "limited" ? (
          line(t("cardScan.pWait"), "alert", t("cardScan.limitedTitle"), t("cardScan.limitedText"))
        ) : (
          line(t("cardScan.pInvalid"), "alert", t("cardScan.invalidTitle"), t("cardScan.invalidText"))
        )}
        <div className="zt-rule pt-3 text-center">
          <Link to="/" className="zt-link text-xs">ROUT</Link>
        </div>
      </section>
    </main>
  );
}
