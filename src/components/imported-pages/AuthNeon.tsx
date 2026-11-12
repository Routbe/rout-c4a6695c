import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { toast } from "sonner";
import { ArrowLeft, Fingerprint, KeyRound, LifeBuoy, Loader2, Lock, Mail, MailCheck, ShieldCheck } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { POST_AUTH_PATH, AUTH_ERROR_CODES } from "@/lib/auth/post-auth";
import { beginAuthIntent } from "@/lib/tour-draft.functions";
import { Altcha } from "@/components/Altcha";
import { isAdminMode } from "@/lib/app-mode";
import { usePortalFrame } from "@/components/layout/PortalContext";
import { withAltcha } from "@/lib/altcha-client";
import { AUTH_UNAVAILABLE_TEXT, type AuthReadiness } from "@/lib/auth-readiness";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { SIGNUP_CONSENT_VERSION, canSubmitSignUp } from "@/lib/signup-consent";
import { isMinorDob, signupAgeProblem } from "@/lib/minor-safety";
import { redeemLoginCodeFn } from "@/lib/login-code.functions";
import { SecondFactorStep } from "@/components/auth/SecondFactorStep";
import { PublicProviderSignIn } from "@/components/auth/PublicProviderSignIn";

/** Deliberately permissive: catches typos, never rejects a valid address. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "signin" | "signup" | "recovery" | "reset";
/** Steps inside the sign-in card. */
type SignInStep = "choose" | "password" | "link-sent" | "second" | "reset-request" | "reset-sent";
const MIN_PASSWORD = 12;
type ApiResult = { data?: Record<string, unknown>; error?: { code?: string; message?: string } };

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

async function postJson(path: string, body: unknown, proof: string): Promise<ApiResult> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-altcha": proof },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { data: json };
  return { error: { code: typeof json["code"] === "string" ? json["code"] : `http_${res.status}`, message: typeof json["message"] === "string" ? json["message"] : undefined } };
}

/** First-passkey enrollment must run signed out, so the ticket/token decides the account. */
async function enrollPasskey(context: string, name: string) {
  await authClient.signOut().catch(() => null);
  const res = await authClient.passkey.addPasskey({ context, name, createSession: true } as never);
  const error = (res as { error?: { message?: string; code?: string } } | undefined)?.error;
  if (error) throw Object.assign(new Error(error.message || "passkey_failed"), { code: error.code });
}

/**
 * ROUT sign-in card. First step: passkey (WebAuthn/FIDO2), one-time e-mail link
 * (with a 6-digit code for another device) or e-mail + password. Members with
 * 2FA on finish with a second step (passkey, authenticator app, SMS or recovery
 * code). Sign-up creates the account together with its first passkey.
 */
export default function AuthNeon({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { t } = useTranslation();
  const { locale } = useI18n();
  const adminPortal = Boolean(usePortalFrame()) || isAdminMode();
  const { user, refresh } = useAuth();

  const [mode, setMode] = useState<Mode>(adminPortal && initialMode === "signup" ? "signin" : initialMode);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<SignInStep>("choose");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [mailCode, setMailCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [recoveryFiled, setRecoveryFiled] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [dob, setDob] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const minor = isMinorDob(dob);
  const redirected = useRef(false);
  const [readiness, setReadiness] = useState<AuthReadiness | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const unavailable = readiness?.ready === false;
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    try { setEmbedded(window.self !== window.top); } catch { setEmbedded(true); }
  }, []);

  useEffect(() => {
    fetch("/api/public/auth/providers", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { providers?: string[]; readiness?: AuthReadiness }) => {
        if (body.readiness) setReadiness(body.readiness);
        setConfiguredProviders(body.providers ?? []);
      })
      .catch(() => setReadiness(null));
  }, []);

  useEffect(() => {
    if (!user || redirected.current || recoveryToken) return;
    redirected.current = true;
    window.location.replace(POST_AUTH_PATH);
  }, [user, recoveryToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const redirect = params.get("redirect") ?? params.get("next");
    const token = params.get("token");
    if (initialMode === "reset") {
      if (token && /^[A-Za-z0-9_-]{8,128}$/.test(token)) setResetToken(token);
      else if (code) toast.error(t("auth.mf.resetInvalid"));
    } else if (token && /^[0-9a-f]{64}$/.test(token)) {
      setRecoveryToken(token);
      setMode("recovery");
    }
    if (params.get("second_factor") === "1") {
      setMode("signin");
      setStep("second");
    }
    if (code && initialMode !== "reset") {
      const known = (AUTH_ERROR_CODES as readonly string[]).includes(code) ? code : "provider_rejected";
      toast.error(known === "method_disabled" ? t("auth.pk.methodDisabled") : known === "link_expired" ? t("auth.mf.linkExpired") : t("auth.pk.failed"));
    }
    if (redirect) void beginAuthIntent({ data: { next: redirect } }).catch(() => null);
    if (params.toString()) window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const onEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(value && !EMAIL_REGEX.test(value.trim()) ? t("auth.ui.email.invalid") : null);
  };
  const emailAccepted = () => {
    if (EMAIL_REGEX.test(email.trim())) return true;
    const message = t("auth.ui.email.invalid");
    setEmailError(message);
    toast.error(message);
    return false;
  };

  const passkeyLogin = async () => {
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    setLoading(true);
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) {
        toast.error(res.error.message || t("auth.passkey.failed"));
        return;
      }
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("auth.passkey.failed")));
    } finally {
      setLoading(false);
    }
  };

  // WebAuthn Conditional UI: saved passkeys appear in the browser's autofill.
  useEffect(() => {
    if (!readiness?.ready || mode !== "signin" || step === "second") return;
    let cancelled = false;
    const pkc = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
    if (!pkc?.isConditionalMediationAvailable) return;
    void pkc.isConditionalMediationAvailable().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        const res = await authClient.signIn.passkey({ autoFill: true });
        if (cancelled || !res || res.error) return;
        toast.success(t("auth.ui.toast.welcome"));
        await refresh();
      } catch {
        // Aborted or dismissed autofill: the explicit passkey button still works.
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness?.ready, mode, step === "second"]);

  const failMessage = (error: { code?: string; message?: string; status?: number } | undefined, fallback: string) => {
    if (!error) return fallback;
    if (error.status === 429 || error.code === "rate_limited") return t("auth.ui.code.tooMany");
    if (error.code === "INVALID_EMAIL_OR_PASSWORD") return t("auth.mf.wrongPassword");
    return error.message || fallback;
  };

  /** One-time e-mail link (+ 6-digit code for another device). */
  const sendLink = async () => {
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (!emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        authClient.signIn.magicLink({ email: address, callbackURL: POST_AUTH_PATH, errorCallbackURL: "/auth/sign-in?error=link_expired", fetchOptions: { headers: { "x-altcha": proof } } }),
      );
      const error = (result as { error?: { code?: string; message?: string; status?: number } } | undefined)?.error;
      if (error) {
        toast.error(failMessage(error, t("auth.mail.failed")));
        return;
      }
      setMailCode("");
      setStep("link-sent");
    } catch (err) {
      toast.error(errorMessage(err, t("auth.mail.failed")));
    } finally {
      setLoading(false);
    }
  };

  const redeemMailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await redeemLoginCodeFn({ data: { email: email.trim().toLowerCase(), code: mailCode } });
      if (!res.ok) {
        toast.error(res.reason === "rate_limited" ? t("auth.ui.code.tooMany") : t("auth.ui.code.invalid"));
        return;
      }
      window.location.assign(res.link);
    } finally {
      setLoading(false);
    }
  };

  const passwordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (!emailAccepted() || !password) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        authClient.signIn.email({ email: address, password, callbackURL: POST_AUTH_PATH, fetchOptions: { headers: { "x-altcha": proof } } }),
      );
      const error = (result as { error?: { code?: string; message?: string; status?: number } } | undefined)?.error;
      if (error) {
        toast.error(failMessage(error, t("auth.ui.toast.signinFailed")));
        return;
      }
      setPassword("");
      if ((result as { data?: { twoFactorRedirect?: boolean } }).data?.twoFactorRedirect) {
        setStep("second");
        return;
      }
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.signinFailed")));
    } finally {
      setLoading(false);
    }
  };

  /** Mails a link to set a first password or replace a forgotten one. */
  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (!emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        authClient.requestPasswordReset({ email: address, redirectTo: "/auth/reset-password", fetchOptions: { headers: { "x-altcha": proof } } }),
      );
      const error = (result as { error?: { code?: string; message?: string; status?: number } } | undefined)?.error;
      if (error) {
        toast.error(failMessage(error, t("auth.ui.toast.failed")));
        return;
      }
      setStep("reset-sent");
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.failed")));
    } finally {
      setLoading(false);
    }
  };

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) return;
    if (password.length < MIN_PASSWORD) { toast.error(t("auth.mf.tooShort")); return; }
    if (password !== password2) { toast.error(t("auth.mf.mismatch")); return; }
    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token: resetToken });
      if (res.error) {
        toast.error(/token/i.test(res.error.message ?? "") ? t("auth.mf.resetInvalid") : res.error.message || t("auth.ui.toast.failed"));
        return;
      }
      setPassword("");
      setPassword2("");
      setResetToken(null);
      toast.success(t("auth.mf.resetDone"));
      setMode("signin");
      setStep("password");
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consented) { toast.error(t("auth.signupConsent.required")); return; }
    const ageProblem = signupAgeProblem({ dob, parentEmail, email });
    if (ageProblem) {
      toast.error(ageProblem === "dob_invalid" ? t("auth.pk.dobInvalid") : t("auth.pk.parentInvalid"));
      return;
    }
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (adminPortal || !emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        postJson("/api/auth-passkey/signup", { email: address, name: name.trim(), dob, parentEmail: minor ? parentEmail.trim().toLowerCase() : "", consent: SIGNUP_CONSENT_VERSION }, proof),
      );
      if (result.error || typeof result.data?.["ticket"] !== "string") {
        toast.error(result.error?.message || t("auth.ui.toast.failed"));
        return;
      }
      await enrollPasskey(result.data["ticket"] as string, "ROUT");
      toast.success(minor ? t("auth.pk.welcomeMinor") : t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      toast.error(code === "account_exists" || /account_exists/.test(String((err as Error).message)) ? t("auth.pk.accountExists") : errorMessage(err, t("auth.pk.failed")));
    } finally {
      setLoading(false);
    }
  };

  const fileRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) => postJson("/api/auth-passkey/recovery", { email: address, note: note.trim() }, proof));
      if (result.error) {
        toast.error(result.error.message || t("auth.ui.toast.failed"));
        return;
      }
      setRecoveryFiled(true);
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.failed")));
    } finally {
      setLoading(false);
    }
  };

  const bindRecoveryPasskey = async () => {
    if (!recoveryToken) return;
    setLoading(true);
    try {
      await enrollPasskey(`rq.${recoveryToken}`, "ROUT");
      setRecoveryToken(null);
      toast.success(t("auth.pk.recovered"));
      await refresh();
    } catch (err) {
      toast.error(/recovery_token_invalid/.test(String((err as Error).message)) ? t("auth.pk.tokenInvalid") : errorMessage(err, t("auth.pk.failed")));
    } finally {
      setLoading(false);
    }
  };

  const emailField = (
    <div className="space-y-1">
      <Label htmlFor="auth-email" className="text-sm">{t("auth.ui.email.label")}</Label>
      <Input
        id="auth-email"
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t("auth.email.placeholder")}
        autoComplete="username webauthn"
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? "auth-email-error" : undefined}
        className={`h-10 rounded-lg ${emailError ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
        required
      />
      {emailError && <p id="auth-email-error" className="text-[11px] text-destructive">{emailError}</p>}
      {!unavailable && <Altcha className="mt-1" />}
    </div>
  );

  const linkButton = (target: Mode, label: string, Icon: typeof KeyRound) => (
    <button
      type="button"
      onClick={() => { setMode(target); setStep("choose"); }}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );

  const linkButtonStep = (target: SignInStep, label: string, Icon: typeof KeyRound) => (
    <button
      type="button"
      onClick={() => setStep(target)}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );

  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col items-center justify-center bg-background p-4 text-foreground">
        {!adminPortal && (
          <div className="w-full max-w-md md:max-w-4xl">
            <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> {t("auth.ui.back")}
            </Link>
          </div>
        )}

        <div className={`w-full rounded-2xl border border-border bg-card p-5 sm:p-7 ${!adminPortal && (mode === "signin" || mode === "signup") && step !== "second" ? "max-w-md md:max-w-4xl" : "max-w-md"}`}>
          <div className="mb-4">
            <h1 className="mb-1 font-display text-2xl text-foreground">
              {adminPortal ? t("auth.admin") : mode === "signup" ? t("auth.ui.signup.cta") : mode === "recovery" ? t("auth.pk.recoveryTitle") : mode === "reset" ? t("auth.mf.resetTitle") : t("auth.ui.title")}
            </h1>
            {mode !== "reset" && step !== "second" && (
              <p className="text-sm text-muted-foreground">{mode === "recovery" ? t("auth.pk.recoverySubtitle") : mode === "signup" ? t("auth.pk.signupSubtitle") : t("auth.pk.subtitle")}</p>
            )}
          </div>

          {!adminPortal && (mode === "signin" || mode === "signup") && step !== "second" && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setStep("choose"); }} className={`h-10 rounded-lg text-sm font-medium transition ${mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t("auth.ui.title")}</button>
              <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setStep("choose"); }} className={`h-10 rounded-lg text-sm font-medium transition ${mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t("auth.ui.signup.cta")}</button>
            </div>
          )}
          {embedded && (
            <Alert className="mb-4"><AlertDescription className="flex flex-col gap-2">
              <span>Inloggen en registreren met een passkey werkt niet in dit ingebedde venster. Open de pagina in een nieuw tabblad.</span>
              <a href={typeof window !== "undefined" ? window.location.href : "/auth/sign-in"} target="_blank" rel="noopener noreferrer" className="font-medium underline">Open in nieuw tabblad</a>
            </AlertDescription></Alert>
          )}
          {unavailable && <Alert variant="destructive" className="mb-4"><AlertDescription>{AUTH_UNAVAILABLE_TEXT[locale]}</AlertDescription></Alert>}

          {mode === "signin" && step === "second" && (
            <SecondFactorStep
              allowTrust={!adminPortal}
              onDone={refresh}
              onRestart={() => setStep("choose")}
            />
          )}

          {mode === "signin" && step !== "second" && (
            <div className="space-y-3">
              {(step === "choose" || step === "password") && (
                <div className={adminPortal ? "space-y-3" : "flex flex-col gap-4 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-8"}>
                  {!adminPortal && <>
                    <div className="md:order-3"><PublicProviderSignIn configured={configuredProviders} readiness={readiness} disabled={loading} /></div>
                    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground md:order-2 md:flex-col md:py-2" aria-hidden>
                      <span className="h-px flex-1 bg-border md:h-auto md:w-px" /> of <span className="h-px flex-1 bg-border md:h-auto md:w-px" />
                    </div>
                  </>}
                  <div className="space-y-3 md:order-1">
                  <Button type="button" onClick={() => void passkeyLogin()} disabled={loading || unavailable} className="cta-glow h-auto min-h-12 w-full gap-2 whitespace-normal px-4 py-3 text-center text-sm leading-tight sm:text-base">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4 shrink-0" />} <span className="min-w-0">{t("auth.passkey")}</span>
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">{t("auth.passkey.hint")}</p>
                  <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-border" aria-hidden /> {t("auth.mf.orEmail")} <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                  <form onSubmit={step === "password" ? passwordLogin : (e) => { e.preventDefault(); void sendLink(); }} className="space-y-3">
                    {emailField}
                    {step === "password" && (
                      <div className="space-y-1">
                        <Label htmlFor="auth-password" className="text-sm">{t("auth.mf.password")}</Label>
                        <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={128} required className="h-10 rounded-lg" />
                      </div>
                    )}
                    {step === "password" ? (
                      <Button type="submit" disabled={loading || unavailable || !password} className="h-11 w-full gap-2 rounded-lg">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {t("auth.ui.password.signin")}
                      </Button>
                    ) : (
                      <Button type="submit" variant="outline" disabled={loading || unavailable || !!emailError} className="h-11 w-full gap-2 rounded-lg">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {t("auth.mf.sendLink")}
                      </Button>
                    )}
                  </form>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {step === "password"
                      ? linkButtonStep("choose", t("auth.mf.useLink"), Mail)
                      : linkButtonStep("password", t("auth.mf.usePassword"), Lock)}
                    {linkButtonStep("reset-request", t("auth.mf.forgot"), KeyRound)}
                  </div>
                  {adminPortal && <p className="text-[11px] text-muted-foreground">{t("auth.mf.adminNote")}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    {!adminPortal && linkButton("signup", t("auth.ui.signup.cta"), KeyRound)}
                    {linkButton("recovery", t("auth.mf.recoveryLink"), LifeBuoy)}
                  </div>
                  </div>
                </div>
              )}

              {step === "link-sent" && (
                <div className="space-y-3" data-testid="auth-link-sent">
                  <div className="space-y-2 rounded-2xl border border-border bg-card/60 p-4 text-center">
                    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60"><MailCheck className="h-5 w-5" aria-hidden /></span>
                    <p className="font-medium text-foreground">{t("auth.mf.linkSentTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("auth.mf.linkSentBody", { email: email.trim().toLowerCase() })}</p>
                  </div>
                  <form onSubmit={redeemMailCode} className="space-y-2">
                    <Label htmlFor="auth-mail-code" className="text-sm">{t("auth.mf.codeFromMail")}</Label>
                    <input
                      id="auth-mail-code"
                      value={mailCode}
                      onChange={(e) => setMailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="h-11 w-full rounded-xl border border-input bg-background text-center font-mono tracking-[0.4em] text-foreground"
                    />
                    <Button type="submit" disabled={loading || mailCode.length !== 6} className="h-11 w-full rounded-xl">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.mf.useCode")}
                    </Button>
                  </form>
                  {linkButtonStep("choose", t("auth.mf.otherAddress"), ArrowLeft)}
                </div>
              )}

              {step === "reset-request" && (
                <form onSubmit={requestReset} className="space-y-3">
                  <div>
                    <p className="font-medium text-foreground">{t("auth.mf.resetRequestTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("auth.mf.resetRequestBody")}</p>
                  </div>
                  {emailField}
                  <Button type="submit" disabled={loading || unavailable || !!emailError} className="h-11 w-full gap-2 rounded-lg">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {t("auth.mf.resetSend")}
                  </Button>
                  {linkButtonStep("choose", t("auth.mf.backToSignIn"), ArrowLeft)}
                </form>
              )}

              {step === "reset-sent" && (
                <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-4 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60"><MailCheck className="h-5 w-5" aria-hidden /></span>
                  <p className="text-sm text-muted-foreground">{t("auth.mf.resetSent", { email: email.trim().toLowerCase() })}</p>
                  {linkButtonStep("choose", t("auth.mf.backToSignIn"), ArrowLeft)}
                </div>
              )}
            </div>
          )}

          {mode === "reset" && (
            resetToken ? (
              <form onSubmit={saveNewPassword} className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("auth.mf.resetBody")}</p>
                <div className="space-y-1">
                  <Label htmlFor="auth-new-password" className="text-sm">{t("auth.mf.newPassword")}</Label>
                  <Input id="auth-new-password" type="password" value={password} minLength={MIN_PASSWORD} maxLength={128} autoComplete="new-password" required onChange={(e) => setPassword(e.target.value)} className="h-10 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="auth-new-password-2" className="text-sm">{t("auth.mf.repeatPassword")}</Label>
                  <Input id="auth-new-password-2" type="password" value={password2} minLength={MIN_PASSWORD} maxLength={128} autoComplete="new-password" required onChange={(e) => setPassword2(e.target.value)} className="h-10 rounded-lg" />
                </div>
                <Button type="submit" disabled={loading || password.length < MIN_PASSWORD || password !== password2} className="h-11 w-full rounded-lg">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.mf.resetSave")}
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("auth.mf.resetInvalid")}</p>
                <Button type="button" variant="outline" className="h-11 w-full" onClick={() => { setMode("signin"); setStep("reset-request"); }}>{t("auth.mf.resetSend")}</Button>
              </div>
            )
          )}

          {mode === "signup" && !adminPortal && (
            <form onSubmit={signUp} className="mx-auto max-w-md space-y-3.5">
              {emailField}
              <div className="space-y-1">
                <Label htmlFor="auth-signup-name" className="text-sm">{t("auth.pk.name")}</Label>
                <Input id="auth-signup-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-signup-dob" className="text-sm">{t("auth.pk.dob")}</Label>
                <input
                  id="auth-signup-dob"
                  type="date"
                  required
                  value={dob}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1900-01-01"
                  onChange={(e) => setDob(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </div>
              {minor && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  <Label htmlFor="auth-signup-parent" className="text-sm">{t("auth.pk.parentEmail")}</Label>
                  <input
                    id="auth-signup-parent"
                    type="email"
                    required
                    autoComplete="off"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("auth.pk.parentNote")} <Link to="/info/parental-consent" target="_blank" className="underline">{t("auth.pk.parentHow")}</Link>
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
                <Checkbox id="auth-signup-consent" checked={consented} onCheckedChange={(v) => setConsented(v === true)} required aria-required="true" className="mt-0.5" />
                <label htmlFor="auth-signup-consent" className="text-xs leading-relaxed text-muted-foreground">
                  {t("auth.signupConsent.before")}{" "}
                  <Link to="/terms" className="font-medium text-foreground underline underline-offset-2">{t("auth.signupConsent.terms")}</Link>{" "}
                  {t("auth.signupConsent.and")}{" "}
                  <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">{t("auth.signupConsent.privacy")}</Link>{" "}
                  {t("auth.signupConsent.after")}
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("auth.pk.signupNote")}</p>
              <Button type="submit" className="h-11 w-full gap-2 rounded-lg font-medium" disabled={!canSubmitSignUp({ consented, busy: loading, unavailable, emailError: !!emailError })}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />} {t("auth.pk.signupCta")}
              </Button>
              {linkButton("signin", t("auth.pk.haveAccount"), Fingerprint)}
            </form>
          )}

          {mode === "recovery" && (
            recoveryToken ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {t("auth.pk.bindIntro")}</p>
                <Button type="button" onClick={() => void bindRecoveryPasskey()} disabled={loading || unavailable} className="h-11 w-full gap-2 rounded-lg">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />} {t("auth.pk.bindCta")}
                </Button>
              </div>
            ) : recoveryFiled ? (
              <div data-testid="auth-recovery-filed" className="space-y-3 rounded-2xl border border-border bg-card/60 p-4 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60"><MailCheck className="h-5 w-5" aria-hidden /></span>
                <p className="text-sm text-muted-foreground">{t("auth.pk.recoveryFiled")}</p>
                {linkButton("signin", t("auth.pk.haveAccount"), Fingerprint)}
              </div>
            ) : (
              <form onSubmit={fileRecovery} className="space-y-3.5">
                {emailField}
                <div className="space-y-1">
                  <Label htmlFor="auth-recovery-note" className="text-sm">{t("auth.pk.recoveryNote")}</Label>
                  <Textarea id="auth-recovery-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} rows={3} />
                </div>
                <Button type="submit" className="h-11 w-full rounded-lg" disabled={loading || unavailable || !!emailError}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.pk.recoveryCta")}
                </Button>
                {linkButton("signin", t("auth.pk.haveAccount"), Fingerprint)}
              </form>
            )
          )}
        </div>
      </div>
    </AppLayout>
  );
}
