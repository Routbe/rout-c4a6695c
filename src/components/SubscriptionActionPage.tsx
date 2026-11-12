import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, MailX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { confirmNewsletterSubscription, leaveNewsletter } from "@/lib/newsletter.functions";

/**
 * Confirm or leave a profile signup. Mail scanners open links with GET, so the
 * actual change only happens after the visitor presses the button.
 */
export function SubscriptionActionPage({ mode, token }: { mode: "confirm" | "leave"; token: string }) {
  const { t } = useI18n();
  const confirm = useServerFn(confirmNewsletterSubscription);
  const leave = useServerFn(leaveNewsletter);
  const [state, setState] = useState<"idle" | "busy" | "ok" | "failed">("idle");
  const [handle, setHandle] = useState<string | null>(null);

  const run = async () => {
    setState("busy");
    try {
      const res = mode === "confirm" ? await confirm({ data: { token } }) : await leave({ data: { token } });
      if (res.ok && "handle" in res && typeof res.handle === "string") setHandle(res.handle);
      setState(res.ok ? "ok" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="font-display text-2xl">{t(mode === "confirm" ? "subscribe.confirm.title" : "subscribe.leave.title")}</h1>
        {state === "ok" ? (
          <div className="space-y-3" role="status">
            {mode === "confirm" ? <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden /> : <MailX className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />}
            <p className="text-sm text-muted-foreground">{t(mode === "confirm" ? "subscribe.confirm.done" : "subscribe.leave.done")}</p>
            {handle && (
              <a href={`/${handle}`} className="text-sm font-medium underline underline-offset-4">
                {t("subscribe.backToProfile", { handle: `@${handle}` })}
              </a>
            )}
          </div>
        ) : state === "failed" ? (
          <div className="space-y-3" role="alert">
            <XCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("subscribe.invalid")}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t(mode === "confirm" ? "subscribe.confirm.body" : "subscribe.leave.body")}</p>
            <Button onClick={() => void run()} disabled={state === "busy" || !token} className="gap-2">
              {state === "busy" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t(mode === "confirm" ? "subscribe.confirm.button" : "subscribe.leave.button")}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
