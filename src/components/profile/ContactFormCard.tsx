import { useTranslation } from "react-i18next";
import { useState, type CSSProperties, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Altcha } from "@/components/Altcha";
import { takeProof } from "@/lib/altcha-client";
import { submitLeadCapture } from "@/lib/lead-capture.functions";
import { CONTACT_MESSAGE_MAX, type ContactFormConfig } from "@/lib/contact-form";

/** Publiek contactformulier / e-mailcapture met Brevo-notificatie voor de eigenaar. */
export function ContactFormCard({
  handle,
  config,
  style,
}: {
  handle: string;
  config: ContactFormConfig;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await submitLeadCapture({
        data: {
          handle,
          name: config.nameField ? name : null,
          email,
          message: config.messageField ? message : null,
          altcha: await takeProof(),
        },
      });
      if (res.ok) {
        setDone(true);
        toast.success(res.message);
        const next = safeFormRedirect(config.redirectUrl);
        if (next) window.location.assign(next);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(t("profile.sendFailedRetry"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-zinc-200/80 p-4 text-left shadow-sm"
      style={style}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="h-4 w-4 shrink-0" aria-hidden />
        {config.title}
      </p>
      {config.subtitle && <p className="mt-1 text-xs opacity-70">{config.subtitle}</p>}

      {done ? (
        <p className="mt-3 text-sm font-medium">{config.successMessage}</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 space-y-2">
          {config.nameField && (
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              placeholder={t("profile.yourName")}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t("profile.name")}
            />
          )}
          <input
            type="email"
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder={t("profile.emailExample")}
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={t("profile.email")}
          />
          {config.messageField && (
            <textarea
              className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              placeholder={t("profile.yourMessage")}
              maxLength={CONTACT_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-label={t("profile.message")}
            />
          )}
          <Altcha />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
             {t("profile.send")} </button>
        </form>
      )}
    </div>
  );
}

/**
 * Owner-configured "after submit" redirects may only stay on this site; an external
 * address goes through the /go confirmation page so visitors see where they are sent.
 */
function safeFormRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
    return `/go?w=${encodeURIComponent(u.toString())}`;
  } catch {
    return null;
  }
}
