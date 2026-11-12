import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Copy, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db/client";
import { getForwardingState, requestForwardingChange } from "@/lib/forwarding.functions";
import { getMyAccount } from "@/lib/account.functions";
import { i18n as trI18n } from "@/lib/i18n";

/** username@rout.be forwarding configuration — Early Believer / verified members only. */
export function EmailForwardingPanel() {
  const { user } = useAuth();
  const loadState = useServerFn(getForwardingState);
  const requestChange = useServerFn(requestForwardingChange);
  const loadAccount = useServerFn(getMyAccount);

  const [handle, setHandle] = useState("");
  const [eligible, setEligible] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [publicly, setPublicly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Set when the opt-in mail could not be delivered: the token is still valid,
  // so we surface the link instead of stalling the flow.
  const [fallback, setFallback] = useState<{ url: string; error: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const data = await loadAccount();
      if (cancelled) return;
      const isEligible = Boolean(data.verified || data.isEarlyBeliever || data.isPaid);
      setHandle(data.username ?? "");
      setEligible(isEligible);
      setPublicly(Boolean(data.showEmailPublicly));
      setForwardTo(data.forwardingEmail ?? user.email ?? "");

      if (isEligible) {
        try {
          const state = await loadState({});
          if (cancelled) return;
          setSavedEmail(state.email);
          setConfirmed(state.verified);
          setPending(state.pending);
          if (state.email) setForwardTo(state.email);
        } catch {
          /* keep the RPC values as a fallback */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadState, loadAccount]);

  if (loading) return null;

  const alias = `${handle || "handle"}@rout.be`;

  // Free / unverified: never show a working alias — show the locked upsell card.
  if (!eligible) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/60 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              Email alias locked
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Upgrade to Early Believer to unlock your{" "}
              <span className="font-mono text-foreground">@rout.be</span> e-mail alias. Free
              profiles keep their public link hub at{" "}
              <span className="font-mono">rout.be/u/@{handle || "handle"}</span>, without mail
              forwarding.
            </p>
            <div className="pt-2">
              <Button asChild size="sm" className="h-9 rounded-full px-4">
                <a href="/dashboard?tab=verify#checkout">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Become an Early Believer
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const emailChanged = forwardTo.trim().toLowerCase() !== (savedEmail ?? "").toLowerCase();

  const save = async () => {
    const value = forwardTo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error(trI18n.t("ui.28da097e5e"));
      return;
    }
    setSaving(true);

    // The public-visibility switch is a presentation flag and stays client-side.
    const { error } = await db
      .from("profiles")
      .update({ show_email_publicly: publicly })
      .eq("id", user!.id);
    if (error) {
      setSaving(false);
      toast.error(trI18n.t("ui.a5adb735ff"));
      return;
    }

    if (!emailChanged && confirmed) {
      setSaving(false);
      toast.success(trI18n.t("ui.e267bbda93"));
      return;
    }

    const result = await requestChange({
      data: { email: value },
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(
        result.reason === "not_entitled"
          ? "Email forwarding requires an active Early Believer verification."
          : result.reason === "rate_limited"
            ? "Too many attempts — try again in a few minutes."
            : "Could not start the confirmation for that address.",
      );
      return;
    }

    setSavedEmail(value);
    setConfirmed(false);
    setPending(true);
    setFallback(
      result.sent ? null : { url: result.confirmUrl ?? "", error: result.deliveryError ?? null },
    );
    toast.success(
      result.sent
        ? `Confirmation sent to ${value}. Forwarding starts once you click the link.`
        : "Address saved as unconfirmed — the confirmation e-mail could not be sent yet.",
    );
  };

  /** Resends the opt-in mail for the address that is already stored. */
  const resend = async () => {
    if (!savedEmail) return;
    setSaving(true);
    const result = await requestChange({
      data: { email: savedEmail },
    });
    setSaving(false);
    if (result.ok && result.sent) {
      setFallback(null);
      toast.success(`Confirmation re-sent to ${savedEmail}.`);
    } else if (result.ok) {
      setFallback({ url: result.confirmUrl ?? "", error: result.deliveryError ?? null });
      toast.error(trI18n.t("ui.28970a512b"));
    } else toast.error(trI18n.t("ui.5833d0e575"));
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <Mail className="h-4 w-4" aria-hidden /> Email forwarding
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Mail sent to your ROUT alias is forwarded to the inbox you choose below. A new address
          only becomes active after you confirm it from that inbox.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{alias}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          onClick={() => {
            void navigator.clipboard.writeText(alias);
            toast.success(trI18n.t("ui.ecd9c25432"));
          }}
        >
          <Copy className="mr-1 h-3 w-3" /> Copy
        </Button>
      </div>

      {fallback && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            {fallback.error ?? "The confirmation e-mail could not be sent."} Your address is saved
            as unconfirmed — open the confirmation link below to activate forwarding.
          </p>
          {fallback.url && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg"
              onClick={() => {
                void navigator.clipboard.writeText(fallback.url);
                toast.success(trI18n.t("ui.50f60f2463"));
              }}
            >
              <Copy className="mr-1 h-3 w-3" /> Copy confirmation link
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="forward-to" className="text-xs font-semibold">
            Forward to
          </Label>
          {savedEmail && confirmed && !emailChanged ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Confirmed
            </span>
          ) : pending && !emailChanged ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" aria-hidden /> Pending verification
            </span>
          ) : null}
        </div>
        <Input
          id="forward-to"
          type="email"
          value={forwardTo}
          onChange={(e) => setForwardTo(e.target.value)}
          placeholder="you@example.com"
          className="input-field h-10 rounded-xl"
        />
        {pending && !emailChanged && (
          <p className="text-[11px] text-muted-foreground">
            Waiting for confirmation — forwarding is paused until the link in that inbox is opened.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => void resend()}
            >
              Re-send confirmation
            </button>
          </p>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
        <span className="text-xs">
          <span className="block font-medium">Show alias on my public profile</span>
          <span className="block text-muted-foreground">
            Adds a “Contact via {alias}” button to your link hub.
          </span>
        </span>
        <Switch checked={publicly} onCheckedChange={setPublicly} />
      </label>

      <Button type="button" className="h-10 rounded-xl" disabled={saving} onClick={save}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {emailChanged ? "Save & send confirmation" : "Save forwarding settings"}
      </Button>
    </section>
  );
}
