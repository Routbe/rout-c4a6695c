import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  finishBlueskyLogin,
  getPendingBlueskyLogin,
  requestFediverseEmailCode,
} from "@/lib/bluesky-login.functions";

/**
 * Laatste stap na een geslaagde Bluesky-aanmelding: Bluesky geeft geen
 * e-mailadres door, en zonder e-mailadres bestaat er geen ROUT-account.
 */
export const Route = createFileRoute("/auth/bluesky")({
  head: () => ({
    meta: [
      { title: i18next.t("auth.meta.complete") },
      {
        name: "description",
        content: i18next.t("auth.meta.completeDescription"),
      },
      { property: "og:title", content: i18next.t("auth.meta.complete") },
      {
        property: "og:description",
        content: i18next.t("auth.meta.completeDescription"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlueskyEmailStep,
});

function BlueskyEmailStep() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [handle, setHandle] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getPendingBlueskyLogin({})
      .then((res) => {
        setHandle(res.handle);
        setProvider(res.provider);
      })
      .catch(() => setHandle(null));
  }, []);

  const providerLabel = provider === "mastodon" ? "Mastodon" : "Bluesky";

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      await requestFediverseEmailCode({ data: { email } });
      setStep("code");
      toast.success(t("auth.code.sent"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.retry"));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await finishBlueskyLogin({ data: { code } });
      await refresh();
      void nav({ to: res.next as never, replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.retry"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-7">
          <h1 className="mb-1 font-display text-2xl text-foreground">
            {step === "email" ? t("auth.fedi.title") : t("auth.ui.sent.title")}
          </h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {step === "email"
              ? `${handle ? t("auth.fedi.verified", { handle, name: providerLabel }) : ""}${t("auth.fedi.email")}`
              : t("auth.fedi.code", { email })}
          </p>
          {step === "email" ? (
            <form onSubmit={sendCode} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="bsky-email" className="text-sm">{t("auth.ui.email.label")}</Label>
                <Input
                  id="bsky-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.email.placeholder")}
                  autoComplete="email"
                  maxLength={254}
                  required
                  className="h-10 rounded-lg"
                />
              </div>
              <Button type="submit" className="h-11 w-full rounded-lg font-medium" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.code.send")}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="bsky-code" className="text-sm">{t("auth.ui.code.label")}</Label>
                <Input
                  id="bsky-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  required
                  className="h-10 rounded-lg text-center font-mono text-lg tracking-[0.4em]"
                />
              </div>
              <Button type="submit" className="h-11 w-full rounded-lg font-medium" disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.account.confirm")}
              </Button>
              <div className="flex justify-between text-xs text-muted-foreground">
                <button type="button" className="hover:text-foreground" onClick={() => setStep("email")}>
                  {t("auth.ui.other")}
                </button>
                <button type="button" className="hover:text-foreground" disabled={loading} onClick={() => void sendCode()}>
                  {t("auth.code.resend")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
