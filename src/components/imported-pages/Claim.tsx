import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Check, Loader2, X } from "lucide-react";
import { NamespaceOwnership } from "@/components/NamespaceOwnership";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { checkHandleAvailability, suggestHandlesFromEmailAddress } from "@/lib/bootstrap.functions";
import { claimHandle, getMyHandle, getVerifiedHandleOptions } from "@/lib/claim.functions";
import { Altcha } from "@/components/Altcha";
import { takeProof } from "@/lib/altcha-client";
import { digitCount, FREE_HANDLE_MIN_DIGITS, handleLengthMessage } from "@/lib/handle-rules";
import { hasValidDigitSuffix } from "@/lib/handle-suggestions";
import { HandleOptionPicker, type HandleOption } from "@/components/HandleOptionPicker";
import { notifyError, notifySuccess } from "@/lib/notify";
import { db } from "@/lib/db/client";
import { withAuthTimeout } from "@/lib/auth-timeout";

type State = { checking: boolean; ok: boolean | null; reason?: string };

/**
 * Flat-UI claim tool: type a handle, get instant availability feedback, claim it.
 * Doubles as the post-confirmation landing page for every auth e-mail.
 */
export default function Claim() {
  const nav = useNavigate();
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<State>({ checking: false, ok: null });
  const [claiming, setClaiming] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [options, setOptions] = useState<HandleOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [profileCheck, setProfileCheck] = useState<"checking" | "ready" | "error">("checking");
  const [profileAttempt, setProfileAttempt] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setProfileCheck("checking");
    void (async () => {
      try {
        console.info("[claim:member-check:start]");
        const result = await withAuthTimeout(getMyHandle({}), "claim:getMyHandle", 5_000);
        if (!active) return;
        if (result.handle) {
          console.info("[claim:member-check:existing] redirecting to dashboard");
          setCurrent(result.handle);
          nav("/dashboard/routes", { replace: true });
          return;
        }
        const { data, error } = await withAuthTimeout(
          db
            .from("profiles")
            .select("verified, status, display_name")
            .eq("id", user.id)
            .maybeSingle(),
          "claim:profile",
          5_000,
        );
        if (error) throw error;
        if (!active) return;
        setVerified(Boolean(data?.verified) && data?.status === "active");
        setProfileCheck("ready");
        console.info("[claim:member-check:new] claim form enabled");
      } catch (error) {
        if (!active) return;
        console.error("[claim:member-check:failed]", error);
        setProfileCheck("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [user, nav, profileAttempt]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading((prev) => {
      if (!prev) setRegenerating(true);
      return true;
    });
    try {
      const res = await getVerifiedHandleOptions({});
      setOptions(
        res.options.map((o) => ({ handle: o.handle, status: o.status as HandleOption["status"] })),
      );
    } catch {
      notifyError(t("claim.options.loadFailed"), {
        description: t("claim.options.loadFailedDesc"),
        key: "claim:load-options",
      });
    } finally {
      setOptionsLoading(false);
      setRegenerating(false);
    }
  }, [t]);

  // Verified members: load their generated options exactly once per session,
  // not on every render — the effect only re-runs if `verified` flips.
  useEffect(() => {
    if (!user || !verified) return;
    loadOptions();
  }, [user, verified, loadOptions]);

  // Free tier: derive suggestions from the part before the @ of their e-mail
  // (jona.delplanche@gmail.com → jona.delplanche48) and pre-fill the first one.
  useEffect(() => {
    if (!user?.email || verified || current) return;
    let active = true;
    // Google/GitHub give us a real name — prefer it over the e-mail prefix.
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaName = [
      meta["full_name"],
      meta["name"],
      [meta["given_name"], meta["family_name"]].filter(Boolean).join(" "),
    ].find((v) => typeof v === "string" && v.trim().length > 1) as string | undefined;
    suggestHandlesFromEmailAddress({ data: { email: metaName?.trim() || user.email } })
      .then((res) => {
        if (!active || res.handles.length === 0) return;
        setEmailSuggestions(res.handles);
        setHandle((prev) => {
          if (prev.trim()) return prev;
          setState({ checking: false, ok: true });
          return res.handles[0]!;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.email, user?.user_metadata, verified, current]);

  const onSelectOption = (option: string) => {
    setHandle(option);
    setState({ checking: false, ok: true });
  };

  const onChange = (value: string) => {
    setHandle(value);
    window.clearTimeout(timer.current);
    if (!value.trim()) return setState({ checking: false, ok: null });

    const lengthIssue = handleLengthMessage(value);
    if (lengthIssue) return setState({ checking: false, ok: false, reason: lengthIssue });
    // Gratis leden delen de drukke ruimte: minstens 5 tekens én 2 cijfers.
    if (!verified && digitCount(value) < FREE_HANDLE_MIN_DIGITS) {
      return setState({ checking: false, ok: false, reason: t("claim.free.digits") });
    }
    if (!hasValidDigitSuffix(value)) {
      return setState({
        checking: false,
        ok: false,
        reason: t("claim.digits"),
      });
    }

    setState({ checking: true, ok: null });
    timer.current = window.setTimeout(async () => {
      try {
        const res = await checkHandleAvailability({ data: { handle: value } });
        setState({ checking: false, ok: res.ok, reason: res.reason });
      } catch {
        setState({
          checking: false,
          ok: null,
          reason:
            typeof navigator !== "undefined" && navigator.onLine === false
              ? t("claim.offline")
              : t("claim.checkFailed"),
        });
      }
    }, 300);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      nav(`/auth?mode=signup&redirect=${encodeURIComponent("/claim")}`);
      return;
    }
    setClaiming(true);
    try {
      const res = await claimHandle({ data: { handle, altcha: await takeProof() } });
      if (!res.ok) {
        setState({ checking: false, ok: false, reason: res.reason });
        notifyError(res.reason ?? t("claim.claimFailed"), { key: "claim:submit" });
        return;
      }
      notifySuccess(t("claim.claimed.toast", { handle: res.handle }));
      setCurrent(res.handle);
      nav("/dashboard");
    } catch {
      notifyError(t("claim.claimFailedRetry"), { key: "claim:submit-fail" });
    } finally {
      setClaiming(false);
    }
  };

  const preview = handle.trim().replace(/^@/, "").toLowerCase() || "your.handle";

  if (authLoading || (user && (profileCheck === "checking" || current))) {
    return (
      <AppLayout>
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-5 text-foreground">
          <div className="flex min-h-44 w-full max-w-md items-center justify-center rounded-2xl border border-border bg-card">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Account wordt gecontroleerd…
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (user && profileCheck === "error") {
    return (
      <AppLayout>
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-5 text-center text-foreground">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
            <h1 className="font-display text-2xl">Accountcontrole mislukt</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We konden niet veilig bepalen of je al een handle hebt. Probeer het opnieuw.
            </p>
            <Button className="mt-6" onClick={() => setProfileAttempt((value) => value + 1)}>
              Opnieuw proberen
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Already claimed → this screen becomes a quiet identity card, never a form.
  if (current) {
    return (
      <AppLayout>
        <div className="-mx-4 -my-8 flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-background px-5 text-foreground sm:-mx-6">
          <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/40 p-8 text-center backdrop-blur-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/40">
              <Check className="h-5 w-5 text-accent" aria-hidden />
            </span>
            <h1 className="mt-6 font-display text-2xl leading-tight text-foreground">
              {t("claim.mine.title", { handle: current })}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("claim.mine.body")}</p>

            <div className="mt-8 text-left">
              <NamespaceOwnership handle={current} />
            </div>

            <Button
              className="mt-8 h-12 w-full rounded-2xl text-base font-medium"
              onClick={() => nav("/dashboard")}
            >
              {t("claim.mine.cta")}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="-mx-4 -my-8 flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-5 sm:-mx-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="font-display text-3xl leading-tight text-foreground sm:text-4xl">
              {t("claim.title")}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{t("claim.subtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-8">
            {verified ? (
              <div className="space-y-4">
                <HandleOptionPicker
                  options={options}
                  loading={optionsLoading}
                  value={handle.trim().replace(/^@/, "").toLowerCase()}
                  onSelect={onSelectOption}
                  disabled={claiming}
                  onRegenerate={loadOptions}
                  regenerating={regenerating}
                />
                <p
                  aria-live="polite"
                  className={`text-center text-xs ${state.ok === false ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {state.ok === true
                    ? t("claim.available", { handle: preview })
                    : (state.reason ?? t("claim.hintOptions"))}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <Label htmlFor="claim-handle" className="sr-only">
                  {t("claim.handleLabel")}
                </Label>
                <div className="group flex items-center gap-1 rounded-2xl border border-border/60 bg-card/40 px-5 transition-shadow focus-within:border-border focus-within:ring-4 focus-within:ring-foreground/5">
                  <span className="select-none font-mono text-lg text-muted-foreground/50">@</span>
                  <Input
                    id="claim-handle"
                    value={handle}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={t("claim.placeholder")}
                    autoComplete="off"
                    aria-invalid={state.ok === false}
                    aria-describedby="claim-msg"
                    disabled={claiming}
                    className="h-16 flex-1 rounded-none border-0 bg-transparent px-1 font-mono text-lg shadow-none focus-visible:ring-0"
                  />
                  <span className="flex w-5 shrink-0 items-center justify-center">
                    {state.checking ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : state.ok === true ? (
                      <Check className="h-4 w-4 text-accent" aria-hidden />
                    ) : state.ok === false ? (
                      <X className="h-4 w-4 text-destructive" aria-hidden />
                    ) : null}
                  </span>
                </div>
                <p
                  id="claim-msg"
                  aria-live="polite"
                  className={`text-center text-xs ${state.ok === false ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {state.checking
                    ? t("claim.checking")
                    : state.ok === true
                      ? t("claim.available", { handle: preview })
                      : (state.reason ?? t("claim.free.rule"))}
                </p>

                {emailSuggestions.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {emailSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={claiming}
                        onClick={() => onChange(s)}
                        className="rounded-full border border-border/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                      >
                        @{s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {state.ok === true ? (
              <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
                <NamespaceOwnership handle={preview} />
              </div>
            ) : null}

            <Altcha />

            <Button
              type="submit"
              className="h-12 w-full rounded-2xl text-base font-medium"
              disabled={claiming || authLoading || state.ok !== true}
            >
              {claiming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : user ? (
                t("claim.cta")
              ) : (
                t("claim.ctaSignup")
              )}
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
