import { useTranslation } from "react-i18next";
import { useEffect, useState, type CSSProperties } from "react";
import { CalendarClock, Loader2, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { subscribeNewsletter } from "@/lib/newsletter.functions";
import { Altcha } from "@/components/Altcha";
import { takeProof } from "@/lib/altcha-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Interactieve kaarten op het publieke profiel (nieuwsbrief, agenda, promo). */

/** Resterende tijd tot een ISO-datum, of null wanneer de actie voorbij is. */
function countdownLabel(iso: string | undefined, now: number): string | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `nog ${days}d ${hours}u`;
  if (hours > 0) return `nog ${hours}u ${minutes}m`;
  return `nog ${minutes}m`;
}

/** Featured link met accentrand, badge en optionele aftelklok. */
export function PromoBlock({
  href,
  label,
  badge,
  expiresAt,
  style,
  accent,
}: {
  href: string;
  label: string;
  badge?: string | undefined;
  expiresAt?: string | undefined;
  style: CSSProperties;
  accent: string;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const countdown = countdownLabel(expiresAt, now);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex min-h-14 w-full flex-col gap-1 px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90"
      style={{ ...style, border: `1px solid ${accent}`, boxShadow: `0 0 0 3px ${accent}22` }}
    >
      <span className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label || t("profile.latestOffer")}</span>
      </span>
      {(badge || countdown) && (
        <span className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide opacity-90">
          {badge && (
            <span
              className="rounded-full px-2 py-0.5"
              style={{ border: `1px solid ${accent}`, color: accent }}
            >
              {badge}
            </span>
          )}
          {countdown && <span>{countdown}</span>}
        </span>
      )}
    </a>
  );
}

/** Brevo-nieuwsbriefinschrijving, volledig in de pagina. */
export function NewsletterBlock({
  handle,
  label,
  style,
}: {
  handle: string;
  label: string;
  style: CSSProperties;
}) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const res = await subscribeNewsletter({
        data: { handle, email: email.trim(), locale: i18n.language || null, altcha: await takeProof() },
      });
      if (res.ok) {
        setDone(res.message);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("profile.subscribeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 px-4 py-3" style={style}>
      <span className="flex items-center gap-2 text-sm font-medium">
        <Mail className="h-4 w-4" aria-hidden />
        {label || t("profile.newsletterLabel")}
      </span>
      {done ? (
        <span className="text-xs opacity-80" role="status">{done}</span>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("profile.emailExample")}
            aria-label={t("profile.email")}
            maxLength={200}
            className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:opacity-60"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-current/30 px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
             {t("profile.subscribe")} </button>
        </div>
      )}
      {!done && <span className="text-[10px] opacity-60">{t("profile.signupPrivacy")}</span>}
      <Altcha />
    </form>
  );
}

/** Detecteert een boekingslink (Cal.com / Calendly) zodat we die kunnen embedden. */
export function isBookingUrl(url: string): boolean {
  return /(^|\/\/|\.)(cal\.com|calendly\.com)\//i.test(url);
}

/** Cal.com / Calendly in een overlay, zodat bezoekers de pagina niet verlaten. */
export function BookingBlock({
  href,
  label,
  style,
}: {
  href: string;
  label: string;
  style: CSSProperties;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const embed = href.includes("?") ? `${href}&embed=true` : `${href}?embed=true`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80"
        style={style}
      >
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-center">{label || t("profile.scheduleCall")}</span>
        <span className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{label || t("profile.scheduleCall")}</DialogTitle>
          </DialogHeader>
          <iframe
            src={embed}
            title={label || t("profile.bookingCalendar")}
            className="h-[70vh] w-full rounded-b-lg border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
