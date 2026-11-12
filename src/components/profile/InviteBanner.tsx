import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gift, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { readReferrer, normalizeReferralCode } from "@/lib/referral";
import { INVITEE_PERCENT_OFF } from "@/lib/referral-rewards";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_KEY = "rout_invite_dismissed";

/**
 * Shown on the inviter's profile when the visitor arrived through
 * `rout.be/r/<handle>` or `rout.be/r/u/<alias>`. Signed-in members never see it.
 */
export function InviteBanner({ handle, displayName }: { handle: string; displayName?: string | null }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ref = readReferrer();
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* ignore */
    }
    setShow(!!ref && ref === normalizeReferralCode(handle) && !dismissed);
  }, [handle]);

  if (!show || user) return null;
  const name = displayName || `@${handle}`;
  const close = () => {
    setShow(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:bottom-auto sm:top-4 sm:mx-auto sm:max-w-xl" role="dialog" aria-label={t("invite.title", { name })}>
      <div className="relative rounded-3xl border border-border bg-card p-5 shadow-lg">
        <button type="button" onClick={close} aria-label={t("invite.close")} className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-start gap-3 pr-10">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Gift className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-serif text-lg font-semibold text-foreground">{t("invite.title", { name })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("invite.body", { percent: INVITEE_PERCENT_OFF })}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Link to="/tour" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-foreground px-5 text-sm font-semibold text-background">
            {t("invite.cta")}
          </Link>
          <Link to="/explore" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border px-4 text-sm text-foreground hover:bg-accent">
            {t("explore.crumb")}
          </Link>
          <Link to="/about" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border px-4 text-sm text-foreground hover:bg-accent">
            {t("about.crumb")}
          </Link>
        </div>
      </div>
    </div>
  );
}
